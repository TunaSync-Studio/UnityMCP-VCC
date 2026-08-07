// sys.* reads and the lease.* methods.
// Everything here is requiresLease:false (reads never need the lease; the
// lease.* methods manage it explicitly). eval.run and job.* live in
// EvalHandlers (P2).
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace TunaSync.UnityMCP.Editor
{
    internal static class SysHandlers
    {
        public static void RegisterAll()
        {
            Dispatcher.RegisterMethod("sys.info", false, (p, ctx) =>
                Task.FromResult<object>(BuildInfoObject()));

            // Normally intercepted by the Dispatcher transport fast-path; this
            // main-thread fallback keeps the method answerable if the fast
            // path is ever bypassed.
            Dispatcher.RegisterMethod("sys.status", false, (p, ctx) =>
                Task.FromResult<object>(Dispatcher.BuildStatusObject()));

            Dispatcher.RegisterMethod("sys.compile.status", false, (p, ctx) =>
                Task.FromResult<object>(CompileGate.StatusObject()));

            Dispatcher.RegisterMethod("sys.echo", false, (p, ctx) =>
                Task.FromResult<object>(p ?? new JObject()));

            Dispatcher.RegisterMethod("lease.acquire", false, LeaseAcquire);
            Dispatcher.RegisterMethod("lease.release", false, LeaseRelease);
            Dispatcher.RegisterMethod("lease.status", false, (p, ctx) =>
                Task.FromResult<object>(LeaseManager.StatusObject()));
            Dispatcher.RegisterMethod("lease.takeover", false, LeaseTakeover);
        }

        /// <summary>
        /// welcome-shaped info without the version field (PROTOCOL.md sys.info).
        /// Reads only cached McpEditorInfo and lock-guarded lease state, so it
        /// is safe to call from transport threads (welcome is built on the
        /// read thread right after hello).
        /// </summary>
        public static object BuildInfoObject()
        {
            return new
            {
                plugin = new { version = McpEditorInfo.PluginVersion },
                unity = new
                {
                    version = McpEditorInfo.UnityVersion,
                    projectPath = McpEditorInfo.ProjectPath,
                    projectName = McpEditorInfo.ProjectName,
                },
                editor = new
                {
                    sessionId = McpEditorInfo.EditorSessionId,
                    pid = McpEditorInfo.Pid,
                    domainReloadCount = McpEditorInfo.DomainReloadCount,
                },
                eval = new { engine = EvalService.EngineName },
                lease = new { holder = LeaseManager.CurrentHolder() },
                features = BuildFeatures(),
            };
        }

        /// <summary>Capability introspection for clients. Static per compile (versionDefines).</summary>
        private static string[] BuildFeatures()
        {
            var features = new System.Collections.Generic.List<string>
            {
                "state", "scene", "capture", "wake",
            };
#if MCP_NDMF
            features.Add("ndmf");
#endif
#if MCP_VRCSDK3_AVATARS
            features.Add("vrcAvatars");
#endif
#if MCP_VRCSDK3_WORLDS
            features.Add("vrcWorlds");
#endif
            return features.ToArray();
        }

        /// <summary>Welcome payload: info + negotiated protocol version. Transport-thread safe.</summary>
        public static JObject BuildWelcomePayload(int negotiatedVersion)
        {
            JObject payload = Frames.Obj(BuildInfoObject());
            payload["v"] = negotiatedVersion;
            return payload;
        }

        private static Task<object> LeaseAcquire(JObject p, RequestContext ctx)
        {
            RejectForeignClientId(p, ctx, "lease.acquire");
            if (!LeaseManager.TryAcquire(ctx.SessionId, ReadTtlMs(p)))
            {
                throw new McpHandlerException(ErrorCodes.LeaseHeld,
                    "write lease held by '" + (LeaseManager.CurrentHolder() ?? "?") + "'");
            }
            return Task.FromResult<object>(new
            {
                acquired = true,
                holder = ctx.SessionId,
                ttlMs = LeaseManager.CurrentTtlMs(),
            });
        }

        private static Task<object> LeaseRelease(JObject p, RequestContext ctx)
        {
            RejectForeignClientId(p, ctx, "lease.release");
            bool released = LeaseManager.Release(ctx.SessionId);
            return Task.FromResult<object>(new { released });
        }

        private static Task<object> LeaseTakeover(JObject p, RequestContext ctx)
        {
            RejectForeignClientId(p, ctx, "lease.takeover");
            string previousHolder = LeaseManager.Takeover(ctx.SessionId, ReadTtlMs(p));
            return Task.FromResult<object>(new
            {
                holder = ctx.SessionId,
                previousHolder,
                ttlMs = LeaseManager.CurrentTtlMs(),
            });
        }

        /// <summary>
        /// Lease identity IS the connection sessionId (liveness-checked for
        /// disconnected-holder steal). A different clientId used to be silently
        /// ignored - now it is an explicit contract error.
        /// </summary>
        private static void RejectForeignClientId(JObject p, RequestContext ctx, string method)
        {
            JToken t = p != null ? p["clientId"] : null;
            string clientId = t != null && t.Type != JTokenType.Null ? t.Value<string>() : null;
            if (!string.IsNullOrEmpty(clientId) && clientId != ctx.SessionId)
            {
                throw new McpHandlerException(ErrorCodes.InvalidParams,
                    method + ": clientId must be this connection's own sessionId ('" + ctx.SessionId +
                    "'). Lease identity is the connection session (its liveness backs the " +
                    "disconnected-holder steal); acting on behalf of another client is not supported.");
            }
        }

        /// <summary>ttlMs param (0 = plugin default 120 s). Clamping happens in LeaseManager.</summary>
        private static long ReadTtlMs(JObject p)
        {
            JToken t = p != null ? p["ttlMs"] : null;
            if (t == null || t.Type == JTokenType.Null) return 0;
            try
            {
                long v = t.Value<long>();
                return v > 0 ? v : 0;
            }
            catch
            {
                return 0;
            }
        }
    }
}
