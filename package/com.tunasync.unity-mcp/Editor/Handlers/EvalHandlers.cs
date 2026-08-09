// P2 method surface: eval.run and job.*.
// eval.run and job.submit are mutating (requiresLease: true); job reads are
// lease-free. eval.run {code, captureLogs?, runAsJob?}: inline honors the
// request deadline; runAsJob submits through JobManager and returns {jobId}.
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace TunaSync.UnityMCP.Editor
{
    internal static class EvalHandlers
    {
        public static void RegisterAll()
        {
            Dispatcher.RegisterMethod("eval.run", true, EvalRun);
            Dispatcher.RegisterMethod("job.submit", true, JobSubmit);
            Dispatcher.RegisterMethod("job.status", false, JobStatus);
            Dispatcher.RegisterMethod("job.wait", false, JobWait);
            Dispatcher.RegisterMethod("job.cancel", false, JobCancel);
        }

        private static async Task<object> EvalRun(JObject p, RequestContext ctx)
        {
            string code = ReadString(p, "code");
            if (string.IsNullOrEmpty(code))
            {
                throw new McpHandlerException(ErrorCodes.InvalidParams, "eval.run: 'code' is required");
            }
            bool captureLogs = ReadBool(p, "captureLogs", true);
            bool runAsJob = ReadBool(p, "runAsJob", false);
            ThrowIfPlayModeBlocked(ReadBool(p, "allowPlayMode", false));

            if (runAsJob)
            {
                string jobId = JobManager.Submit("eval.run", p, ctx.SessionId);
                return new { jobId };
            }

            return await EvalService.RunAsync(code, captureLogs, ctx.Token,
                (pct, message, phase) => ctx.Progress(pct, message, phase));
        }

        /// <summary>
        /// P0-2: scene edits made in play mode silently revert on exit while
        /// AssetDatabase changes persist, leaving scene and assets divergent.
        /// Block writes by default; an explicit allowPlayMode is an informed
        /// opt-in. Main thread only (reads EditorApplication).
        /// </summary>
        internal static void ThrowIfPlayModeBlocked(bool allowPlayMode)
        {
            if (allowPlayMode) return;
            if (!UnityEditor.EditorApplication.isPlaying) return;
            throw new McpHandlerException(ErrorCodes.PlayModeActive,
                "the editor is in play mode: scene changes made now revert on exit while asset " +
                "changes persist, leaving the project inconsistent. Exit play mode first, or pass " +
                "allow_play_mode:true if you intend to touch the running scene.");
        }

        private static Task<object> JobSubmit(JObject p, RequestContext ctx)
        {
            string method = ReadString(p, "method");
            if (string.IsNullOrEmpty(method))
            {
                throw new McpHandlerException(ErrorCodes.InvalidParams, "job.submit: 'method' is required");
            }
            JObject prm = p["params"] as JObject ?? new JObject();
            string jobId = JobManager.Submit(method, prm, ctx.SessionId);
            return Task.FromResult<object>(new { jobId });
        }

        private static Task<object> JobStatus(JObject p, RequestContext ctx)
        {
            string jobId = ReadString(p, "jobId");
            if (string.IsNullOrEmpty(jobId))
            {
                return Task.FromResult<object>(JobManager.AllRecords());
            }
            JobRecord record = JobManager.GetRecord(jobId);
            if (record == null)
            {
                throw new McpHandlerException(ErrorCodes.JobNotFound, "unknown job '" + jobId + "'");
            }
            return Task.FromResult<object>(record);
        }

        private static async Task<object> JobWait(JObject p, RequestContext ctx)
        {
            string jobId = ReadString(p, "jobId");
            if (string.IsNullOrEmpty(jobId))
            {
                throw new McpHandlerException(ErrorCodes.InvalidParams, "job.wait: 'jobId' is required");
            }
            int waitMs = ReadInt(p, "timeoutMs", 25000, 100, 24 * 60 * 60 * 1000);
            return await JobManager.WaitAsync(jobId, waitMs, ctx);
        }

        private static Task<object> JobCancel(JObject p, RequestContext ctx)
        {
            string jobId = ReadString(p, "jobId");
            if (string.IsNullOrEmpty(jobId))
            {
                throw new McpHandlerException(ErrorCodes.InvalidParams, "job.cancel: 'jobId' is required");
            }
            JobRecord record = JobManager.GetRecord(jobId);
            if (record == null)
            {
                throw new McpHandlerException(ErrorCodes.JobNotFound, "unknown job '" + jobId + "'");
            }
            bool cancelled = JobManager.Cancel(jobId);
            return Task.FromResult<object>(new { cancelled, state = record.State });
        }

        private static string ReadString(JObject p, string name)
        {
            JToken token = p != null ? p[name] : null;
            return token != null && token.Type != JTokenType.Null ? token.Value<string>() : null;
        }

        private static bool ReadBool(JObject p, string name, bool fallback)
        {
            JToken token = p != null ? p[name] : null;
            if (token == null || token.Type == JTokenType.Null) return fallback;
            try { return token.Value<bool>(); }
            catch { return fallback; }
        }

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

    /// <summary>Runs eval.run as a background job (code re-runs are not resumable).</summary>
    internal sealed class EvalJobExecutor : IJobExecutor
    {
        public string Method => "eval.run";

        public Task<object> Run(JobContext ctx)
        {
            string code = ctx.Params["code"] != null && ctx.Params["code"].Type != JTokenType.Null
                ? ctx.Params["code"].Value<string>()
                : null;
            if (string.IsNullOrEmpty(code))
            {
                throw new McpHandlerException(ErrorCodes.InvalidParams, "eval.run job: 'code' is required");
            }
            bool captureLogs = true;
            JToken cap = ctx.Params["captureLogs"];
            if (cap != null && cap.Type != JTokenType.Null)
            {
                try { captureLogs = cap.Value<bool>(); }
                catch { captureLogs = true; }
            }
            bool allowPlayMode = false;
            JToken apm = ctx.Params["allowPlayMode"];
            if (apm != null && apm.Type != JTokenType.Null)
            {
                try { allowPlayMode = apm.Value<bool>(); }
                catch { allowPlayMode = false; }
            }
            // Same guard as the inline path: the job may execute long after
            // submit, when play mode has started in the meantime.
            EvalHandlers.ThrowIfPlayModeBlocked(allowPlayMode);
            return EvalService.RunAsync(code, captureLogs, ctx.Token,
                (pct, message, phase) => ctx.Report(pct, message, phase));
        }

        public bool CanResume(JobRecord record) => false;

        public Task<object> Resume(JobRecord record, JobContext ctx)
            => throw new System.NotSupportedException("eval.run jobs do not resume");
    }
}
