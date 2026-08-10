// Request dispatcher.
// Dispatch() runs on a transport thread: it validates the req, answers the
// sys.status fast path and watchdog/backpressure failures right there, and
// hops real handlers onto the main thread via MainThreadPump. Handlers are
// async Task and resume on the main thread (Unity SynchronizationContext).
// A CancellationTokenSource enforces the deadline even for handlers that
// never observe their token: the token callback resolves the request and the
// late handler result is dropped.
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace TunaSync.UnityMCP.Editor
{
    /// <summary>Throw from a handler to answer with a specific protocol ErrorObj.</summary>
    public sealed class McpHandlerException : Exception
    {
        public readonly ErrorObj Error;

        public McpHandlerException(ErrorObj error)
            : base(error != null ? error.Message : "handler error")
        {
            Error = error ?? ErrorObj.Make(ErrorCodes.HandlerException, "handler error");
        }

        public McpHandlerException(string code, string message, bool retryable = false)
            : this(ErrorObj.Make(code, message, retryable))
        {
        }
    }

    /// <summary>Per-request context handed to handlers (main thread).</summary>
    public sealed class RequestContext
    {
        public readonly string SessionId;
        public readonly string ReqId;
        public readonly CancellationToken Token;
        private readonly Action<double?, string, string> _emit;

        internal RequestContext(string sessionId, string reqId, CancellationToken token, Action<double?, string, string> emit)
        {
            SessionId = sessionId;
            ReqId = reqId;
            Token = token;
            _emit = emit;
        }

        /// <summary>Emit a progress frame on this request's id. Safe from any thread.</summary>
        public void Progress(double? pct = null, string message = null, string phase = null)
        {
            if (_emit != null) _emit(pct, message, phase);
        }
    }

    public static class Dispatcher
    {
        public const int DefaultTimeoutMs = 60000;
        public const int MaxTimeoutMs = 24 * 60 * 60 * 1000;
        public const long BusyModalThresholdMs = 3000;

        /// <summary>Last non-sys request, for the status window (any client).</summary>
        public static string LastRequestMethod { get; private set; }
        public static DateTime LastRequestAtUtc { get; private set; }

        private sealed class MethodReg
        {
            public string Name;
            public bool RequiresLease;
            public Func<JObject, RequestContext, Task<object>> Handler;
        }

        private sealed class InFlight
        {
            public string Key;                     // sessionInstanceId + ":" + reqId
            public string ReqId;
            public string SessionId;               // hello.client.sessionId (lease identity)
            public ClientSession Session;
            public string Method;
            public bool RequiresLease;
            public CancellationTokenSource Cts;
            public volatile string CancelReason;   // null => deadline (TIMEOUT)
            public int Resolved;                   // 0/1 via Interlocked
            public int ProgressSeq;
        }

        private static readonly ConcurrentDictionary<string, MethodReg> _methods =
            new ConcurrentDictionary<string, MethodReg>(StringComparer.Ordinal);
        private static readonly ConcurrentDictionary<string, InFlight> _inflight =
            new ConcurrentDictionary<string, InFlight>(StringComparer.Ordinal);

        public static void RegisterMethod(string name, bool requiresLease, Func<JObject, RequestContext, Task<object>> handler)
        {
            if (string.IsNullOrEmpty(name) || handler == null) return;
            _methods[name] = new MethodReg { Name = name, RequiresLease = requiresLease, Handler = handler };
        }

        public static bool IsRegistered(string name) => name != null && _methods.ContainsKey(name);

        /// <summary>Entry point for req frames. Transport thread; no Unity API on this path.</summary>
        internal static void Dispatch(Envelope env, ClientSession session)
        {
            if (string.IsNullOrEmpty(env.Id))
            {
                session.Send(Frames.ResError(Frames.NewId(),
                    ErrorObj.Make(ErrorCodes.ProtocolError, "req frame without id")));
                return;
            }

            JObject payload = env.Payload ?? new JObject();
            string method = payload["method"] != null ? payload["method"].Value<string>() : null;
            if (string.IsNullOrEmpty(method))
            {
                session.Send(Frames.ResError(env.Id,
                    ErrorObj.Make(ErrorCodes.InvalidParams, "req.method missing")));
                return;
            }

            JObject prm = payload["params"] as JObject ?? new JObject();

            // Status-window display only; sys.* chatter would drown real work.
            if (!method.StartsWith("sys.", StringComparison.Ordinal))
            {
                LastRequestMethod = method;
                LastRequestAtUtc = DateTime.UtcNow;
            }

            // Fast path: sys.status is answered on the transport thread from the
            // pump snapshot so it works during compile / modal (PROTOCOL.md).
            if (method == "sys.status")
            {
                session.Send(Frames.Res(env.Id, BuildStatusObject()));
                return;
            }

            // F-8 (2.6.4): sys.modal is the server's blocked-editor probe. It
            // must ALSO answer on the transport thread - the sys.status fast
            // path above returns before the watchdog, so a probe routed
            // through it never saw BUSY_MODAL and the F-5 enrichment never
            // fired in the field. Detection only: pressing buttons stays a
            // human decision (ModalProbe is pure user32, bg-thread safe).
            if (method == "sys.modal")
            {
                List<ModalProbe.ModalInfo> probed = ModalProbe.Describe();
                session.Send(Frames.Res(env.Id, new
                {
                    pid = McpEditorInfo.Pid,
                    lastTickAgoMs = MainThreadPump.LastTickAgoMs,
                    modal = probed != null ? probed[0] : null,
                    modalCount = probed != null ? probed.Count : 0,
                }));
                return;
            }

            MethodReg reg;
            if (!_methods.TryGetValue(method, out reg))
            {
                session.Send(Frames.ResError(env.Id,
                    ErrorObj.Make(ErrorCodes.MethodNotFound, "unknown method '" + method + "'")));
                return;
            }

            if (session.InFlightCount >= Protocol.MaxInFlight)
            {
                session.Send(Frames.ResError(env.Id,
                    ErrorObj.Make(ErrorCodes.ProtocolError,
                        "in-flight cap " + Protocol.MaxInFlight + " exceeded")));
                return;
            }

            // Watchdog fast-fail: if the pump has not ticked for >3 s the main
            // thread is stuck (modal dialog, import, ...). Do not queue.
            // Carries the connected process identity so a client can tell a
            // transient stall from the structural case (stale batchmode worker
            // holding the registry - the 2026-08-06 AssetImportWorker incident).
            if (MainThreadPump.LastTickAgoMs > BusyModalThresholdMs)
            {
                bool batch = McpEditorInfo.IsBatchMode;
                // Name the blocker when there is one: a native dialog stall
                // looks identical to a long import from the outside, and that
                // ambiguity once cost a three-hour wait. The probe runs pure
                // user32 on this (background) thread - never the Unity API.
                List<ModalProbe.ModalInfo> modals = ModalProbe.Describe();
                string modalLine = "";
                if (modals != null)
                {
                    ModalProbe.ModalInfo m = modals[0];
                    // F-2: a progress dialog clears itself - telling an agent
                    // "a human must dismiss this" made it press Cancel and
                    // abort live imports. Route the advice by kind.
                    string advice = m.kind == "progress"
                        ? "\n  This is a progress dialog; it clears itself. Do NOT press Cancel - that aborts the operation. Retry after it finishes."
                        : "\n  A human must dismiss this dialog in the editor UI; retrying alone will not clear it.";
                    modalLine = "\n  modal: \"" + m.title + "\"  buttons: [" +
                        string.Join(", ", m.buttons.ToArray()) + "]  kind: " + m.kind +
                        (modals.Count > 1 ? "  (+" + (modals.Count - 1) + " more)" : "") +
                        advice;
                }
                ErrorObj busy = ErrorObj.Make(ErrorCodes.BusyModal,
                    "editor main thread unresponsive for " + MainThreadPump.LastTickAgoMs + " ms" +
                    (batch
                        ? " (batchmode process without an editor loop - likely a stale worker; check the discovery registry)"
                        : "") + modalLine,
                    retryable: !batch);
                busy.Detail = new
                {
                    pid = McpEditorInfo.Pid,
                    projectPath = McpEditorInfo.ProjectPath,
                    projectName = McpEditorInfo.ProjectName,
                    batchMode = batch,
                    lastTickAgoMs = MainThreadPump.LastTickAgoMs,
                    modal = modals != null ? modals[0] : null,
                    modalCount = modals != null ? modals.Count : 0,
                };
                session.Send(Frames.ResError(env.Id, busy));
                return;
            }

            int timeoutMs = DefaultTimeoutMs;
            JToken tmo = payload["timeoutMs"];
            if (tmo != null && tmo.Type != JTokenType.Null)
            {
                try { timeoutMs = tmo.Value<int>(); }
                catch { timeoutMs = DefaultTimeoutMs; }
            }
            if (timeoutMs <= 0) timeoutMs = DefaultTimeoutMs;
            if (timeoutMs > MaxTimeoutMs) timeoutMs = MaxTimeoutMs;

            InFlight inf = new InFlight
            {
                Key = session.InstanceId + ":" + env.Id,
                ReqId = env.Id,
                SessionId = session.SessionId,
                Session = session,
                Method = method,
                RequiresLease = reg.RequiresLease,
                Cts = new CancellationTokenSource(),
            };

            if (!_inflight.TryAdd(inf.Key, inf))
            {
                try { inf.Cts.Dispose(); } catch { }
                session.Send(Frames.ResError(env.Id,
                    ErrorObj.Make(ErrorCodes.ProtocolError, "duplicate req id '" + env.Id + "'")));
                return;
            }
            session.IncrementInFlight();

            // Register before CancelAfter so an instantly-elapsed deadline still fires.
            inf.Cts.Token.Register(() => OnTokenFired(inf));
            inf.Cts.CancelAfter(timeoutMs);

            MainThreadPump.Post(() => RunOnMain(reg, inf, prm));
        }

        /// <summary>True while targetId is in flight for this connection. Transport thread.</summary>
        internal static bool IsInFlight(ClientSession session, string targetId)
        {
            return !string.IsNullOrEmpty(targetId) &&
                   _inflight.ContainsKey(session.InstanceId + ":" + targetId);
        }

        /// <summary>
        /// cancel frame support. Transport thread. The caller acks with
        /// res {found} BEFORE calling this, because Cancel() runs the token
        /// callback synchronously and the target's CANCELLED res would
        /// otherwise be enqueued ahead of the ack (spec: the target resolves
        /// after the ack, or completes normally if it raced).
        /// </summary>
        internal static bool Cancel(ClientSession session, string targetId)
        {
            if (string.IsNullOrEmpty(targetId)) return false;
            InFlight inf;
            if (!_inflight.TryGetValue(session.InstanceId + ":" + targetId, out inf)) return false;
            inf.CancelReason = ErrorCodes.Cancelled;
            SafeCancel(inf);
            return true;
        }

        /// <summary>Domain-reload ritual: resolve every in-flight (non-job; P1 has no jobs) req.</summary>
        public static void FailAllInFlight(string code, bool retryable, string message)
        {
            foreach (InFlight inf in _inflight.Values)
            {
                inf.CancelReason = code;
                Resolve(inf, false, null, ErrorObj.Make(code, message, retryable));
                SafeCancel(inf);
            }
        }

        /// <summary>Lease takeover: resolve the old holder's in-flight mutating reqs with LEASE_LOST.</summary>
        public static void FailInFlightMutating(string sessionId, ErrorObj error)
        {
            if (string.IsNullOrEmpty(sessionId) || error == null) return;
            foreach (InFlight inf in _inflight.Values)
            {
                if (!inf.RequiresLease) continue;
                if (!string.Equals(inf.SessionId, sessionId, StringComparison.Ordinal)) continue;
                inf.CancelReason = error.Code;
                Resolve(inf, false, null, error);
                SafeCancel(inf);
            }
        }

        /// <summary>Drop in-flight bookkeeping for a dead connection (its send queue is gone anyway).</summary>
        internal static void OnSessionClosed(ClientSession session)
        {
            foreach (InFlight inf in _inflight.Values)
            {
                if (!ReferenceEquals(inf.Session, session)) continue;
                inf.CancelReason = ErrorCodes.Cancelled;
                Resolve(inf, false, null, ErrorObj.Make(ErrorCodes.Cancelled, "connection closed"));
                SafeCancel(inf);
            }
        }

        /// <summary>sys.status body. Reads only pump/lease snapshots; safe on transport threads.</summary>
        public static object BuildStatusObject()
        {
            MainThreadPump.Snapshot snap = MainThreadPump.Current;
            return new
            {
                compiling = snap != null && snap.Compiling,
                playMode = (snap != null && snap.IsPlaying) ? "play" : "edit",
                lastTickAgoMs = MainThreadPump.LastTickAgoMs,
                jobs = JobManager.SummaryObject(),
                lease = LeaseManager.StatusObject(),
            };
        }

        // ---- internals ------------------------------------------------------

        private static void SafeCancel(InFlight inf)
        {
            try { inf.Cts.Cancel(); }
            catch (ObjectDisposedException) { }
            catch (AggregateException) { }
        }

        /// <summary>Deadline / cancel callback. May run on a timer or transport thread; no Unity API.</summary>
        private static void OnTokenFired(InFlight inf)
        {
            string reason = inf.CancelReason;
            ErrorObj err;
            if (reason == ErrorCodes.Cancelled)
                err = ErrorObj.Make(ErrorCodes.Cancelled, "cancelled by client");
            else if (reason == ErrorCodes.LeaseLost)
                err = ErrorObj.Make(ErrorCodes.LeaseLost, "write lease lost");
            else if (reason == ErrorCodes.DomainReload)
                err = ErrorObj.Make(ErrorCodes.DomainReload, "editor domain reload in progress", retryable: true);
            else
                err = ErrorObj.Make(ErrorCodes.Timeout, "deadline exceeded on '" + inf.Method + "'");
            Resolve(inf, false, null, err);
        }

        private static async Task RunOnMain(MethodReg reg, InFlight inf, JObject prm)
        {
            // Main thread from here; awaits resume on the main thread.
            if (Volatile.Read(ref inf.Resolved) != 0) return;
            try
            {
                if (inf.Cts.IsCancellationRequested)
                {
                    OnTokenFired(inf);
                    return;
                }

                if (reg.RequiresLease && !LeaseManager.EnsureHeldForWrite(inf.SessionId))
                {
                    Resolve(inf, false, null, ErrorObj.Make(ErrorCodes.LeaseHeld,
                        "write lease held by '" + (LeaseManager.CurrentHolder() ?? "?") + "'"));
                    return;
                }

                RequestContext ctx = new RequestContext(
                    inf.SessionId, inf.ReqId, inf.Cts.Token,
                    (pct, message, phase) => EmitProgress(inf, pct, message, phase));

                object result = await reg.Handler(prm, ctx);
                Resolve(inf, true, result, null);
            }
            catch (OperationCanceledException)
            {
                if (inf.Cts.IsCancellationRequested)
                {
                    OnTokenFired(inf); // maps to TIMEOUT / CANCELLED / LEASE_LOST / DOMAIN_RELOAD
                }
                else
                {
                    Resolve(inf, false, null,
                        ErrorObj.Make(ErrorCodes.HandlerException, "handler cancelled itself"));
                }
            }
            catch (McpHandlerException mex)
            {
                Resolve(inf, false, null, mex.Error);
            }
            catch (Exception ex)
            {
                ErrorObj err = ErrorObj.Make(ErrorCodes.HandlerException, ex.Message);
                err.UnityStack = FirstStackLine(ex);
                Resolve(inf, false, null, err);
            }
        }

        private static void EmitProgress(InFlight inf, double? pct, string message, string phase)
        {
            if (Volatile.Read(ref inf.Resolved) != 0) return;
            int seq = Interlocked.Increment(ref inf.ProgressSeq);
            inf.Session.Send(Frames.Progress(inf.ReqId, pct, message, phase, seq));
        }

        /// <summary>Single resolution point; exactly one res per req id. Safe from any thread.</summary>
        private static void Resolve(InFlight inf, bool ok, object result, ErrorObj error)
        {
            if (Interlocked.Exchange(ref inf.Resolved, 1) != 0) return;
            InFlight removed;
            _inflight.TryRemove(inf.Key, out removed);
            inf.Session.DecrementInFlight();
            try
            {
                inf.Session.Send(ok ? Frames.Res(inf.ReqId, result) : Frames.ResError(inf.ReqId, error));
            }
            catch { }
            try { inf.Cts.Dispose(); } catch { }
        }

        private static string FirstStackLine(Exception ex)
        {
            string st = ex.StackTrace;
            if (string.IsNullOrEmpty(st)) return null;
            int nl = st.IndexOf('\n');
            string line = nl >= 0 ? st.Substring(0, nl) : st;
            return line.Trim();
        }
    }
}
