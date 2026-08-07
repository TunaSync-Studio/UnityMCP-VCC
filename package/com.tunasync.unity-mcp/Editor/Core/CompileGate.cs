// Compile pipeline gate.
// Tracks Idle / Compiling / ReloadImminent from CompilationPipeline events and
// AssemblyReloadEvents.beforeAssemblyReload, collects CompilerMessage
// diagnostics, persists them compactly to SessionState (survives the domain
// reload), and broadcasts compile.started / compile.finished / reload.imminent
// events. AwaitIdleAsync is TCS-based: no polling, no sleeps.
using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using UnityEditor;
using UnityEditor.Compilation;
using UnityEngine;

namespace TunaSync.UnityMCP.Editor
{
    public static class CompileGate
    {
        public enum GateState
        {
            Idle = 0,
            Compiling = 1,
            ReloadImminent = 2,
        }

        private const string DiagsKey = "TunaSync.UnityMCP.CompileDiags.v1";
        private const int MaxDiagnostics = 200;

        private static readonly object _gate = new object();
        private static readonly List<TaskCompletionSource<bool>> _waiters = new List<TaskCompletionSource<bool>>();
        private static readonly Regex CsCodeRx = new Regex(@"\bCS\d{3,5}\b", RegexOptions.Compiled);

        private static volatile int _state;
        private static List<Diagnostic> _collecting;
        private static volatile Diagnostic[] _lastDiagnostics = new Diagnostic[0];
        private static volatile string _finishedAtIso;
        private static long _startedUtcTicks;
        private static bool _initialized;

        public static GateState State => (GateState)_state;

        /// <summary>Diagnostics of the last finished compile (persisted across domain reload).</summary>
        public static Diagnostic[] LastDiagnostics => _lastDiagnostics;

        public static string FinishedAtIso => _finishedAtIso;

        /// <summary>Main thread only. Called once from Bootstrap, BEFORE Bootstrap registers its own beforeAssemblyReload ritual (so reload.imminent precedes bye).</summary>
        public static void Init()
        {
            if (_initialized) return;
            _initialized = true;
            Restore();
            CompilationPipeline.compilationStarted += OnCompilationStarted;
            CompilationPipeline.assemblyCompilationFinished += OnAssemblyCompilationFinished;
            CompilationPipeline.compilationFinished += OnCompilationFinished;
            AssemblyReloadEvents.beforeAssemblyReload += OnBeforeAssemblyReload;
            _state = (int)(EditorApplication.isCompiling ? GateState.Compiling : GateState.Idle);
        }

        /// <summary>
        /// Completes when the pipeline is idle. TCS-based; awaiting from a
        /// main-thread handler resumes on the main thread. Never polls.
        /// </summary>
        public static Task AwaitIdleAsync(CancellationToken ct)
        {
            if (_state == (int)GateState.Idle) return Task.CompletedTask;
            TaskCompletionSource<bool> tcs =
                new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            lock (_gate) _waiters.Add(tcs);
            if (ct.CanBeCanceled)
            {
                CancellationTokenRegistration reg = ct.Register(() => tcs.TrySetCanceled(ct));
                tcs.Task.ContinueWith(_ => reg.Dispose(), TaskScheduler.Default);
            }
            return tcs.Task;
        }

        /// <summary>{compiling, finishedAt?, diagnostics[]} for sys.compile.status (main thread).</summary>
        public static object StatusObject()
        {
            return new
            {
                compiling = EditorApplication.isCompiling || _state != (int)GateState.Idle,
                finishedAt = _finishedAtIso,
                diagnostics = _lastDiagnostics,
            };
        }

        /// <summary>Persist last diagnostics to SessionState. Main thread only.</summary>
        public static void PersistNow()
        {
            PersistedDiags dto = new PersistedDiags
            {
                FinishedAt = _finishedAtIso,
                Diagnostics = _lastDiagnostics,
            };
            SessionState.SetString(DiagsKey, Protocol.Serialize(dto));
        }

        // ---- pipeline callbacks (all main thread) ---------------------------

        private static void OnCompilationStarted(object context)
        {
            _state = (int)GateState.Compiling;
            _startedUtcTicks = DateTime.UtcNow.Ticks;
            lock (_gate) _collecting = new List<Diagnostic>();
            Broadcast(EventKind.CompileStarted, new { });
        }

        private static void OnAssemblyCompilationFinished(string assemblyPath, CompilerMessage[] messages)
        {
            if (messages == null || messages.Length == 0) return;
            lock (_gate)
            {
                if (_collecting == null) _collecting = new List<Diagnostic>();
                for (int i = 0; i < messages.Length; i++)
                {
                    if (_collecting.Count >= MaxDiagnostics) return;
                    _collecting.Add(ToDiagnostic(messages[i]));
                }
            }
        }

        private static void OnCompilationFinished(object context)
        {
            Diagnostic[] diags;
            lock (_gate)
            {
                diags = _collecting != null ? _collecting.ToArray() : new Diagnostic[0];
                _collecting = null;
            }
            _lastDiagnostics = diags;
            _finishedAtIso = DateTime.UtcNow.ToString("o");
            _state = (int)GateState.Idle;

            PersistNow();

            int errors = 0;
            int warnings = 0;
            for (int i = 0; i < diags.Length; i++)
            {
                if (diags[i].Severity == "error") errors++;
                else warnings++;
            }
            long durationMs = _startedUtcTicks > 0
                ? (DateTime.UtcNow.Ticks - _startedUtcTicks) / TimeSpan.TicksPerMillisecond
                : 0;

            Broadcast(EventKind.CompileFinished, new
            {
                ok = errors == 0,
                errors,
                warnings,
                durationMs,
            });

            CompleteWaiters();
        }

        private static void OnBeforeAssemblyReload()
        {
            _state = (int)GateState.ReloadImminent;
            // Bootstrap's ritual (bye + socket close) subscribed after Init(),
            // so this event frame goes out before the bye.
            Broadcast(EventKind.ReloadImminent, new { resumeHintMs = 3000 });
        }

        // ---- internals ------------------------------------------------------

        private static void CompleteWaiters()
        {
            TaskCompletionSource<bool>[] waiters;
            lock (_gate)
            {
                waiters = _waiters.ToArray();
                _waiters.Clear();
            }
            for (int i = 0; i < waiters.Length; i++) waiters[i].TrySetResult(true);
        }

        private static void Broadcast(string kind, object data)
        {
            TcpHost host = TcpHost.Current;
            if (host != null) host.Broadcast(Frames.Event(kind, data));
        }

        private static Diagnostic ToDiagnostic(CompilerMessage m)
        {
            return new Diagnostic
            {
                File = m.file,
                Line = m.line,
                Col = m.column,
                Severity = m.type == CompilerMessageType.Error ? "error" : "warning",
                CsCode = ExtractCsCode(m.message),
                Text = m.message,
            };
        }

        private static string ExtractCsCode(string message)
        {
            if (string.IsNullOrEmpty(message)) return null;
            Match match = CsCodeRx.Match(message);
            return match.Success ? match.Value : null;
        }

        private static void Restore()
        {
            string json = SessionState.GetString(DiagsKey, "");
            if (string.IsNullOrEmpty(json)) return;
            try
            {
                PersistedDiags dto = JsonConvert.DeserializeObject<PersistedDiags>(json, Protocol.JsonSettings);
                if (dto != null)
                {
                    _finishedAtIso = dto.FinishedAt;
                    _lastDiagnostics = dto.Diagnostics ?? new Diagnostic[0];
                }
            }
            catch
            {
                // Corrupt persisted state: start clean.
                _lastDiagnostics = new Diagnostic[0];
                _finishedAtIso = null;
            }
        }

        private sealed class PersistedDiags
        {
            [JsonProperty("finishedAt")] public string FinishedAt;
            [JsonProperty("diagnostics")] public Diagnostic[] Diagnostics;
        }
    }
}
