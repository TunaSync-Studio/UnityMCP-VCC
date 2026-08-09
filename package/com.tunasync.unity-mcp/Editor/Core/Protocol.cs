// Wire protocol contract - mirror of docs/PROTOCOL.md and server/src/protocol.ts.
// Any change lands in all three or not at all.
using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;

namespace TunaSync.UnityMCP.Editor
{
    public static class Protocol
    {
        public const int Version = 1;
        public const int MaxFrameBytes = 64 * 1024 * 1024;
        public const int MaxInFlight = 32;
        public const int HelloTimeoutMs = 5000;
        public const int PortBase = 47700;
        public const int PortSlots = 64;
        public const int PortProbeSteps = 8;
        public const int RegistrySchemaVersion = 1;

        public static readonly JsonSerializerSettings JsonSettings = new JsonSerializerSettings
        {
            ContractResolver = new DefaultContractResolver
            {
                NamingStrategy = new CamelCaseNamingStrategy()
            },
            NullValueHandling = NullValueHandling.Ignore,
            Formatting = Formatting.None,
        };

        public static string Serialize(object o) => JsonConvert.SerializeObject(o, JsonSettings);

        /// <summary>fnv1a32 over the normalized project path (port slot + registry filename).</summary>
        public static uint Fnv1a32(string input)
        {
            uint h = 0x811c9dc5;
            foreach (char c in input)
            {
                h ^= c;
                h *= 0x01000193;
            }
            return h;
        }

        /// <summary>Absolute path -> forward slashes, no trailing slash, lower-case.</summary>
        public static string NormalizeProjectPath(string p)
        {
            string s = p.Replace('\\', '/');
            while (s.Length > 1 && s.EndsWith("/")) s = s.Substring(0, s.Length - 1);
            return s.ToLowerInvariant();
        }

        public static int PreferredPort(string projectPath)
            => PortBase + (int)(Fnv1a32(NormalizeProjectPath(projectPath)) % PortSlots);

        public static string RegistryFileName(string projectPath)
            => Fnv1a32(NormalizeProjectPath(projectPath)).ToString("x8") + ".json";
    }

    public static class FrameType
    {
        public const string Hello = "hello";
        public const string Welcome = "welcome";
        public const string Req = "req";
        public const string Res = "res";
        public const string Progress = "progress";
        public const string Event = "event";
        public const string Cancel = "cancel";
        public const string Ping = "ping";
        public const string Pong = "pong";
        public const string Bye = "bye";
    }

    public static class ErrorCodes
    {
        public const string ParseError = "PARSE_ERROR";
        public const string ProtocolError = "PROTOCOL_ERROR";
        public const string VersionUnsupported = "VERSION_UNSUPPORTED";
        public const string HelloTimeout = "HELLO_TIMEOUT";
        public const string MethodNotFound = "METHOD_NOT_FOUND";
        public const string InvalidParams = "INVALID_PARAMS";
        public const string HandlerException = "HANDLER_EXCEPTION";
        public const string Timeout = "TIMEOUT";
        public const string Cancelled = "CANCELLED";
        public const string DomainReload = "DOMAIN_RELOAD";   // retryable
        public const string BusyModal = "BUSY_MODAL";         // retryable
        public const string LeaseHeld = "LEASE_HELD";
        public const string LeaseLost = "LEASE_LOST";
        public const string JobNotFound = "JOB_NOT_FOUND";
        public const string JobNotResumable = "JOB_NOT_RESUMABLE";
        public const string EvalCompileError = "EVAL_COMPILE_ERROR";
        public const string EvalRuntimeError = "EVAL_RUNTIME_ERROR";
        public const string EvalEngineUnavailable = "EVAL_ENGINE_UNAVAILABLE";
        public const string AuthRequired = "AUTH_REQUIRED";
        public const string PlayModeActive = "PLAY_MODE_ACTIVE";
    }

    public static class EventKind
    {
        public const string Log = "log";
        public const string CompileStarted = "compile.started";
        public const string CompileFinished = "compile.finished";
        public const string ReloadImminent = "reload.imminent";
        public const string PlaymodeChanged = "playmode.changed";
        public const string JobProgress = "job.progress";
        public const string JobTerminal = "job.terminal";
        public const string LeaseLost = "lease.lost";
    }

    [Serializable]
    public class Envelope
    {
        [JsonProperty("v", NullValueHandling = NullValueHandling.Ignore)]
        public int? V;
        [JsonProperty("id")]
        public string Id;
        [JsonProperty("type")]
        public string Type;
        [JsonProperty("payload")]
        public JObject Payload;
    }

    public class ErrorObj
    {
        [JsonProperty("code")] public string Code;
        [JsonProperty("message")] public string Message;
        [JsonProperty("retryable")] public bool Retryable;
        [JsonProperty("detail", NullValueHandling = NullValueHandling.Ignore)] public object Detail;
        [JsonProperty("unityStack", NullValueHandling = NullValueHandling.Ignore)] public string UnityStack;
        [JsonProperty("consoleErrors", NullValueHandling = NullValueHandling.Ignore)] public string[] ConsoleErrors;
        [JsonProperty("diagnostics", NullValueHandling = NullValueHandling.Ignore)] public Diagnostic[] Diagnostics;

        public static ErrorObj Make(string code, string message, bool retryable = false)
            => new ErrorObj { Code = code, Message = message, Retryable = retryable };
    }

    public class Diagnostic
    {
        [JsonProperty("file")] public string File;
        [JsonProperty("line")] public int Line;
        [JsonProperty("col")] public int Col;
        [JsonProperty("severity")] public string Severity;
        [JsonProperty("csCode")] public string CsCode;
        [JsonProperty("text")] public string Text;
    }

    public class RegistryEntry
    {
        [JsonProperty("schemaVersion")] public int SchemaVersion = Protocol.RegistrySchemaVersion;
        [JsonProperty("port")] public int Port;
        [JsonProperty("projectPath")] public string ProjectPath;
        [JsonProperty("projectName")] public string ProjectName;
        [JsonProperty("pid")] public int Pid;
        [JsonProperty("unityVersion")] public string UnityVersion;
        [JsonProperty("pluginVersion")] public string PluginVersion;
        [JsonProperty("protocolV")] public int ProtocolV = Protocol.Version;
        [JsonProperty("startedAt")] public string StartedAt;
        // Same-user auth: random per-session token; clients read it from this
        // file (user-ACL'd %LOCALAPPDATA%) and echo it in hello.client.token.
        [JsonProperty("token", NullValueHandling = NullValueHandling.Ignore)] public string Token;
    }
}
