// Job manager (long operations that survive progress reporting and, where an
// executor supports it, domain reloads).
// - All state transitions, executor code and SessionState persistence run on
//   the MAIN thread (executors are launched through MainThreadPump; awaits
//   resume on the Unity SynchronizationContext). SummaryObject is the only
//   transport-thread reader and touches no Unity API.
// - Records persist as one JSON blob under SessionState key
//   "TunaSync.UnityMCP.Jobs.v1" (every state change; progress throttled 1/s).
//   Terminal jobs prune to the newest 20; blob capped at 256 KB by dropping
//   oldest terminal records first, then stripping result payloads.
// - After a reload, running jobs whose executor CanResume are resumed;
//   everything else running/pending is failed JOB_NOT_RESUMABLE.
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using Debug = UnityEngine.Debug;

namespace TunaSync.UnityMCP.Editor
{
    public static class JobState
    {
        public const string Pending = "pending";
        public const string Running = "running";
        public const string Completed = "completed";
        public const string Failed = "failed";
        public const string Cancelled = "cancelled";

        public static bool IsTerminal(string state)
            => state == Completed || state == Failed || state == Cancelled;
    }

    /// <summary>Wire shape per server/src/protocol.ts JobRecord (camelCase).</summary>
    public sealed class JobRecord
    {
        [JsonProperty("jobId")] public string JobId;
        [JsonProperty("method")] public string Method;
        [JsonProperty("state")] public string State;
        [JsonProperty("phase", NullValueHandling = NullValueHandling.Ignore)] public string Phase;
        [JsonProperty("pct", NullValueHandling = NullValueHandling.Ignore)] public double? Pct;
        [JsonProperty("message", NullValueHandling = NullValueHandling.Ignore)] public string Message;
        [JsonProperty("ownerSessionId")] public string OwnerSessionId;
        [JsonProperty("startedAt")] public string StartedAt;
        [JsonProperty("updatedAt")] public string UpdatedAt;
        [JsonProperty("result", NullValueHandling = NullValueHandling.Ignore)] public JToken Result;
        [JsonProperty("error", NullValueHandling = NullValueHandling.Ignore)] public ErrorObj Error;
        [JsonProperty("reloadCount")] public int ReloadCount;
    }

    /// <summary>Handed to executors. Report() is safe from any thread.</summary>
    public sealed class JobContext
    {
        public readonly string JobId;
        public readonly JObject Params;
        public readonly CancellationToken Token;
        private readonly Action<double?, string, string> _report;

        internal JobContext(string jobId, JObject prm, CancellationToken token, Action<double?, string, string> report)
        {
            JobId = jobId;
            Params = prm;
            Token = token;
            _report = report;
        }

        public void Report(double? pct = null, string message = null, string phase = null)
        {
            if (_report != null) _report(pct, message, phase);
        }
    }

    public interface IJobExecutor
    {
        string Method { get; }
        /// <summary>Runs on the main thread (async; awaits resume on main).</summary>
        Task<object> Run(JobContext ctx);
        bool CanResume(JobRecord record);
        Task<object> Resume(JobRecord record, JobContext ctx);
    }

    public static class JobManager
    {
        private const string BlobKey = "TunaSync.UnityMCP.Jobs.v1";
        private const int MaxTerminalKept = 20;
        private const int MaxBlobChars = 256 * 1024;
        private static readonly long ThrottleTicks = TimeSpan.TicksPerSecond; // 1/s

        private sealed class JobEntry
        {
            public JobRecord Record;
            public JObject Params;
            public CancellationTokenSource Cts; // null for restored terminal records
            public TaskCompletionSource<JobRecord> Terminal;
            public readonly List<Action<JobRecord>> Listeners = new List<Action<JobRecord>>();
            public long LastBroadcastTicks;
        }

        private static readonly ConcurrentDictionary<string, JobEntry> _jobs =
            new ConcurrentDictionary<string, JobEntry>(StringComparer.Ordinal);
        private static readonly Dictionary<string, IJobExecutor> _executors =
            new Dictionary<string, IJobExecutor>(StringComparer.Ordinal);
        private static long _lastProgressPersistTicks;
        private static bool _persistFailedLogged;

        /// <summary>Main thread, Bootstrap init only (before the host starts).</summary>
        public static void RegisterExecutor(IJobExecutor executor)
        {
            if (executor == null || string.IsNullOrEmpty(executor.Method)) return;
            _executors[executor.Method] = executor;
        }

        public static bool HasExecutor(string method)
            => method != null && _executors.ContainsKey(method);

        /// <summary>{total, running} for sys.status. Safe from transport threads (no Unity API).</summary>
        public static object SummaryObject()
        {
            int total = 0;
            int running = 0;
            foreach (JobEntry entry in _jobs.Values)
            {
                total++;
                if (entry.Record.State == JobState.Running) running++;
            }
            return new { total, running };
        }

        /// <summary>Running-job count for the HTTP health body. Transport-thread safe.</summary>
        public static int RunningCount
        {
            get
            {
                int running = 0;
                foreach (JobEntry entry in _jobs.Values)
                {
                    if (entry.Record.State == JobState.Running) running++;
                }
                return running;
            }
        }

        /// <summary>MAIN thread (handler). Returns the new jobId.</summary>
        public static string Submit(string method, JObject prm, string ownerSessionId)
        {
            IJobExecutor executor;
            if (string.IsNullOrEmpty(method) || !_executors.TryGetValue(method, out executor))
            {
                throw new McpHandlerException(ErrorCodes.MethodNotFound,
                    "no job executor registered for '" + (method ?? "null") + "'");
            }

            string jobId = "job-" + Guid.NewGuid().ToString("N").Substring(0, 12);
            string now = NowIso();
            JobEntry entry = new JobEntry
            {
                Record = new JobRecord
                {
                    JobId = jobId,
                    Method = method,
                    State = JobState.Pending,
                    OwnerSessionId = ownerSessionId,
                    StartedAt = now,
                    UpdatedAt = now,
                    ReloadCount = 0,
                },
                Params = prm ?? new JObject(),
                Cts = new CancellationTokenSource(),
                Terminal = new TaskCompletionSource<JobRecord>(TaskCreationOptions.RunContinuationsAsynchronously),
            };
            _jobs[jobId] = entry;
            PersistNow();

            MainThreadPump.Post(() => RunJobAsync(entry, executor, resume: false));
            return jobId;
        }

        /// <summary>MAIN thread (handler). True when a non-terminal job was signalled.</summary>
        public static bool Cancel(string jobId)
        {
            JobEntry entry;
            if (string.IsNullOrEmpty(jobId) || !_jobs.TryGetValue(jobId, out entry)) return false;
            if (JobState.IsTerminal(entry.Record.State)) return false;

            if (entry.Record.State == JobState.Pending)
            {
                // Not started yet: terminal now; the queued RunJobAsync will no-op.
                try { entry.Cts.Cancel(); } catch { }
                SetTerminal(entry, JobState.Cancelled, null,
                    ErrorObj.Make(ErrorCodes.Cancelled, "job cancelled before start"));
                return true;
            }

            // Running: signal; state flips to cancelled when Run observes the token.
            try { entry.Cts.Cancel(); } catch { }
            return true;
        }

        /// <summary>
        /// MAIN thread. Signals every non-terminal job and immediately closes
        /// pending jobs. Used by the human kill switch before transport stop.
        /// </summary>
        public static int CancelAll()
        {
            int signalled = 0;
            foreach (JobEntry entry in _jobs.Values)
            {
                if (JobState.IsTerminal(entry.Record.State)) continue;
                if (Cancel(entry.Record.JobId)) signalled++;
            }
            return signalled;
        }

        public static JobRecord GetRecord(string jobId)
        {
            JobEntry entry;
            return jobId != null && _jobs.TryGetValue(jobId, out entry) ? entry.Record : null;
        }

        public static JobRecord[] AllRecords()
        {
            List<JobRecord> records = new List<JobRecord>();
            foreach (JobEntry entry in _jobs.Values) records.Add(entry.Record);
            records.Sort((a, b) => string.CompareOrdinal(a.StartedAt, b.StartedAt));
            return records.ToArray();
        }

        /// <summary>
        /// MAIN thread (handler). Long-poll: streams progress frames on the
        /// waiting req id, resolves with the terminal record, or TIMEOUT.
        /// </summary>
        public static async Task<object> WaitAsync(string jobId, int waitMs, RequestContext ctx)
        {
            JobEntry entry;
            if (string.IsNullOrEmpty(jobId) || !_jobs.TryGetValue(jobId, out entry))
            {
                throw new McpHandlerException(ErrorCodes.JobNotFound, "unknown job '" + (jobId ?? "null") + "'");
            }
            if (JobState.IsTerminal(entry.Record.State)) return entry.Record;

            Action<JobRecord> listener = r => ctx.Progress(r.Pct, r.Message, r.Phase);
            lock (entry.Listeners) entry.Listeners.Add(listener);
            try
            {
                Task<JobRecord> terminal = entry.Terminal.Task;
                Task timeout = Task.Delay(waitMs, ctx.Token);
                Task done = await Task.WhenAny(terminal, timeout);
                if (ReferenceEquals(done, terminal)) return await terminal;
                ctx.Token.ThrowIfCancellationRequested(); // request deadline/cancel -> OCE
                throw new McpHandlerException(ErrorCodes.Timeout,
                    "job.wait timed out after " + waitMs + " ms; job state=" + entry.Record.State);
            }
            finally
            {
                lock (entry.Listeners) entry.Listeners.Remove(listener);
            }
        }

        /// <summary>Domain-reload ritual step 1. MAIN thread.</summary>
        public static void PersistNow()
        {
            try
            {
                PersistedBlob blob = new PersistedBlob();
                foreach (JobEntry entry in _jobs.Values)
                {
                    blob.Jobs.Add(new PersistedJob { Record = entry.Record, Params = entry.Params });
                }
                blob.Jobs.Sort((a, b) => string.CompareOrdinal(a.Record.StartedAt, b.Record.StartedAt));

                string json = Protocol.Serialize(blob);
                while (json.Length > MaxBlobChars && RemoveOldestTerminal(blob))
                {
                    json = Protocol.Serialize(blob);
                }
                if (json.Length > MaxBlobChars)
                {
                    for (int i = 0; i < blob.Jobs.Count; i++)
                    {
                        blob.Jobs[i] = new PersistedJob
                        {
                            Record = StrippedClone(blob.Jobs[i].Record),
                            Params = null,
                        };
                    }
                    json = Protocol.Serialize(blob);
                }
                SessionState.SetString(BlobKey, json);
            }
            catch (Exception ex)
            {
                if (!_persistFailedLogged)
                {
                    _persistFailedLogged = true;
                    Debug.LogError("[UnityMCP] job persistence failed; jobs are memory-only this session: " + ex.Message);
                }
            }
        }

        /// <summary>
        /// MAIN thread, Bootstrap, after the TCP host started. Restores the
        /// blob; resumes what CanResume, fails the rest JOB_NOT_RESUMABLE.
        /// </summary>
        public static void RestoreAfterReload()
        {
            string json = SessionState.GetString(BlobKey, "");
            if (string.IsNullOrEmpty(json)) return;

            PersistedBlob blob;
            try
            {
                blob = JsonConvert.DeserializeObject<PersistedBlob>(json, Protocol.JsonSettings);
            }
            catch (Exception ex)
            {
                Debug.LogWarning("[UnityMCP] job blob corrupt; dropping: " + ex.Message);
                SessionState.SetString(BlobKey, "");
                return;
            }
            if (blob == null || blob.Jobs == null) return;

            for (int i = 0; i < blob.Jobs.Count; i++)
            {
                PersistedJob pj = blob.Jobs[i];
                if (pj == null || pj.Record == null || string.IsNullOrEmpty(pj.Record.JobId)) continue;
                JobRecord record = pj.Record;
                record.ReloadCount++;

                JobEntry entry = new JobEntry
                {
                    Record = record,
                    Params = pj.Params ?? new JObject(),
                    Terminal = new TaskCompletionSource<JobRecord>(TaskCreationOptions.RunContinuationsAsynchronously),
                };
                _jobs[record.JobId] = entry;

                if (JobState.IsTerminal(record.State))
                {
                    entry.Terminal.TrySetResult(record);
                    continue;
                }

                IJobExecutor executor;
                bool canResume = false;
                if (_executors.TryGetValue(record.Method, out executor))
                {
                    try { canResume = executor.CanResume(record); }
                    catch { canResume = false; }
                }

                if (canResume)
                {
                    record.State = JobState.Running;
                    record.UpdatedAt = NowIso();
                    entry.Cts = new CancellationTokenSource();
                    IJobExecutor resumeWith = executor;
                    MainThreadPump.Post(() => RunJobAsync(entry, resumeWith, resume: true));
                }
                else
                {
                    record.State = JobState.Failed;
                    record.Error = ErrorObj.Make(ErrorCodes.JobNotResumable,
                        "job did not survive the domain reload");
                    record.UpdatedAt = NowIso();
                    entry.Terminal.TrySetResult(record);
                    Broadcast(EventKind.JobTerminal, record);
                }
            }

            PruneTerminalsInMemory();
            PersistNow();
        }

        // ---- internals (all main thread) ------------------------------------

        private static async Task RunJobAsync(JobEntry entry, IJobExecutor executor, bool resume)
        {
            JobRecord record = entry.Record;
            if (JobState.IsTerminal(record.State)) return; // cancelled while queued

            if (!resume)
            {
                record.State = JobState.Running;
                record.UpdatedAt = NowIso();
                PersistNow();
            }
            Broadcast(EventKind.JobProgress, record); // state visibility, bypasses throttle
            entry.LastBroadcastTicks = DateTime.UtcNow.Ticks;

            JobContext ctx = new JobContext(record.JobId, entry.Params, entry.Cts.Token,
                (pct, message, phase) => ReportProgress(entry, pct, message, phase));

            try
            {
                object result = resume ? await executor.Resume(record, ctx) : await executor.Run(ctx);
                SetTerminal(entry, JobState.Completed, ToResultToken(result), null);
            }
            catch (OperationCanceledException)
            {
                if (entry.Cts.IsCancellationRequested)
                {
                    SetTerminal(entry, JobState.Cancelled, null,
                        ErrorObj.Make(ErrorCodes.Cancelled, "job cancelled"));
                }
                else
                {
                    SetTerminal(entry, JobState.Failed, null,
                        ErrorObj.Make(ErrorCodes.HandlerException, "job executor cancelled itself"));
                }
            }
            catch (McpHandlerException mex)
            {
                SetTerminal(entry, JobState.Failed, null, mex.Error);
            }
            catch (Exception ex)
            {
                ErrorObj err = ErrorObj.Make(ErrorCodes.HandlerException, ex.Message);
                err.UnityStack = FirstLine(ex.StackTrace);
                SetTerminal(entry, JobState.Failed, null, err);
            }
        }

        private static void ReportProgress(JobEntry entry, double? pct, string message, string phase)
        {
            // Report() is any-thread by contract, but record mutation and the
            // SessionState persist below are main-thread concerns: marshal in.
            if (!MainThreadPump.IsMainThread)
            {
                MainThreadPump.Post(() => ReportProgress(entry, pct, message, phase));
                return;
            }

            JobRecord record = entry.Record;
            if (JobState.IsTerminal(record.State)) return;

            if (pct.HasValue) record.Pct = pct;
            if (message != null) record.Message = message;
            if (phase != null) record.Phase = phase;
            record.UpdatedAt = NowIso();

            NotifyListeners(entry);

            long now = DateTime.UtcNow.Ticks;
            if (now - entry.LastBroadcastTicks >= ThrottleTicks)
            {
                entry.LastBroadcastTicks = now;
                Broadcast(EventKind.JobProgress, record);
            }
            if (now - _lastProgressPersistTicks >= ThrottleTicks)
            {
                _lastProgressPersistTicks = now;
                PersistNow();
            }
        }

        private static void SetTerminal(JobEntry entry, string state, JToken result, ErrorObj error)
        {
            JobRecord record = entry.Record;
            if (JobState.IsTerminal(record.State)) return;
            record.State = state;
            record.Result = result;
            record.Error = error;
            record.UpdatedAt = NowIso();

            PruneTerminalsInMemory();
            PersistNow();
            Broadcast(EventKind.JobTerminal, record);
            NotifyListeners(entry);
            entry.Terminal.TrySetResult(record);
            try { if (entry.Cts != null) entry.Cts.Dispose(); } catch { }
        }

        private static void NotifyListeners(JobEntry entry)
        {
            Action<JobRecord>[] listeners;
            lock (entry.Listeners) listeners = entry.Listeners.ToArray();
            for (int i = 0; i < listeners.Length; i++)
            {
                try { listeners[i](entry.Record); }
                catch { }
            }
        }

        private static void PruneTerminalsInMemory()
        {
            List<JobEntry> terminal = new List<JobEntry>();
            foreach (JobEntry entry in _jobs.Values)
            {
                if (JobState.IsTerminal(entry.Record.State)) terminal.Add(entry);
            }
            if (terminal.Count <= MaxTerminalKept) return;
            terminal.Sort((a, b) => string.CompareOrdinal(b.Record.UpdatedAt, a.Record.UpdatedAt)); // newest first
            for (int i = MaxTerminalKept; i < terminal.Count; i++)
            {
                JobEntry removed;
                _jobs.TryRemove(terminal[i].Record.JobId, out removed);
            }
        }

        private static bool RemoveOldestTerminal(PersistedBlob blob)
        {
            int oldest = -1;
            for (int i = 0; i < blob.Jobs.Count; i++)
            {
                if (!JobState.IsTerminal(blob.Jobs[i].Record.State)) continue;
                if (oldest < 0 || string.CompareOrdinal(
                        blob.Jobs[i].Record.UpdatedAt, blob.Jobs[oldest].Record.UpdatedAt) < 0)
                {
                    oldest = i;
                }
            }
            if (oldest < 0) return false;
            blob.Jobs.RemoveAt(oldest);
            return true;
        }

        private static JobRecord StrippedClone(JobRecord r)
        {
            return new JobRecord
            {
                JobId = r.JobId,
                Method = r.Method,
                State = r.State,
                Phase = r.Phase,
                Pct = r.Pct,
                Message = r.Message,
                OwnerSessionId = r.OwnerSessionId,
                StartedAt = r.StartedAt,
                UpdatedAt = r.UpdatedAt,
                Result = null, // stripped to fit the blob cap
                Error = r.Error == null ? null : ErrorObj.Make(r.Error.Code, r.Error.Message, r.Error.Retryable),
                ReloadCount = r.ReloadCount,
            };
        }

        private static JToken ToResultToken(object result)
        {
            try { return Frames.Token(result); }
            catch { return JValue.CreateNull(); }
        }

        private static void Broadcast(string kind, JobRecord record)
        {
            TcpHost host = TcpHost.Current;
            if (host != null) host.Broadcast(Frames.Event(kind, record));
        }

        private static string NowIso() => DateTime.UtcNow.ToString("o");

        private static string FirstLine(string text)
        {
            if (string.IsNullOrEmpty(text)) return null;
            int nl = text.IndexOf('\n');
            string line = nl >= 0 ? text.Substring(0, nl) : text;
            line = line.Trim();
            return line.Length > 0 ? line : null;
        }

        private sealed class PersistedJob
        {
            [JsonProperty("record")] public JobRecord Record;
            [JsonProperty("params", NullValueHandling = NullValueHandling.Ignore)] public JObject Params;
        }

        private sealed class PersistedBlob
        {
            [JsonProperty("jobs")] public List<PersistedJob> Jobs = new List<PersistedJob>();
        }
    }

    /// <summary>
    /// Test/regression executor: sleeps ms across N ticks, reporting progress
    /// each tick. CanResume=false on purpose: a reload mid-job deterministically
    /// produces JOB_NOT_RESUMABLE (used by the reload-survival smoke test).
    /// </summary>
    internal sealed class DemoSleepExecutor : IJobExecutor
    {
        public string Method => "sys.demo.sleep";

        public async Task<object> Run(JobContext ctx)
        {
            int ms = ReadInt(ctx.Params, "ms", 5000, 1, 600000);
            int ticks = ReadInt(ctx.Params, "ticks", 10, 1, 1000);
            int perTick = ms / ticks;
            if (perTick < 1) perTick = 1;

            for (int i = 0; i < ticks; i++)
            {
                await Task.Delay(perTick, ctx.Token); // main-thread continuation; cancellable
                ctx.Report(100.0 * (i + 1) / ticks, "tick " + (i + 1) + "/" + ticks, "sleep");
            }
            return new { sleptMs = ms };
        }

        public bool CanResume(JobRecord record) => false;

        public Task<object> Resume(JobRecord record, JobContext ctx)
            => throw new NotSupportedException("sys.demo.sleep does not resume");

        private static int ReadInt(JObject p, string name, int fallback, int min, int max)
        {
            int value = fallback;
            JToken token = p != null ? p[name] : null;
            if (token != null && token.Type != JTokenType.Null)
            {
                try { value = token.Value<int>(); }
                catch { value = fallback; }
            }
            if (value < min) value = min;
            if (value > max) value = max;
            return value;
        }
    }
}
