// Pure/read-mostly helpers for McpStatusWindow.  Nothing in this file is
// exposed as an MCP method.  The upload-arm write is called only from an
// explicit human click in the Unity editor UI.
using System;
using System.IO;
using Newtonsoft.Json.Linq;

namespace TunaSync.UnityMCP.Editor
{
    internal enum McpClientPreset
    {
        Codex = 0,
        Claude = 1,
        Cursor = 2,
        GenericJson = 3,
    }

    internal sealed class UploadArmSnapshot
    {
        public bool Exists;
        public bool Expired;
        public TimeSpan Remaining;
        public string Path;
        /// <summary>Path for display, the home folder shortened to "~".</summary>
        public string DisplayPath;
        public double TtlMinutes;
        /// <summary>A claim lock left behind by a crashed editor (refuses every claim).</summary>
        public bool LockLeft;
    }

    internal static class McpUiModel
    {
        /// <summary>Default arm lifetime; UNITY_MCP_ARM_TTL_MIN overrides it (UploadArmTtlMinutes).</summary>
        internal static readonly TimeSpan UploadArmTtl = TimeSpan.FromMinutes(30);

        internal static string DefaultUploadArmPath => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "UnityMCP", "arm", "vrc-upload.arm");

        /// <summary>
        /// The arm file this editor uses - for the Creator Console AND for
        /// vrc.upload's claim, so arming, the status shown and the gate can
        /// never disagree. Honors UNITY_MCP_ARM_FILE like the server does.
        /// </summary>
        internal static string UploadArmPath => UploadArmClaim.ResolveArmFile(
            Environment.GetEnvironmentVariable("UNITY_MCP_ARM_FILE"), DefaultUploadArmPath);

        /// <summary>The arm lifetime in minutes, honoring UNITY_MCP_ARM_TTL_MIN like the server.</summary>
        internal static double UploadArmTtlMinutes => UploadArmClaim.ResolveTtlMinutes(
            Environment.GetEnvironmentVariable("UNITY_MCP_ARM_TTL_MIN"), UploadArmTtl.TotalMinutes);

        internal static string PresetLabel(McpClientPreset preset)
        {
            switch (preset)
            {
                case McpClientPreset.Codex: return "Codex";
                case McpClientPreset.Claude: return "Claude";
                case McpClientPreset.Cursor: return "Cursor";
                default: return "JSON";
            }
        }

        internal static string ConfigText(McpClientPreset preset)
        {
            switch (preset)
            {
                case McpClientPreset.Codex:
                    return "codex mcp add unity-mcp -- npx -y tunasync-unity-mcp\n\n" +
                           "# Optional ~/.codex/config.toml for long Unity jobs:\n" +
                           "[mcp_servers.unity-mcp]\n" +
                           "command = \"npx\"\n" +
                           "args = [\"-y\", \"tunasync-unity-mcp\"]\n" +
                           "tool_timeout_sec = 1300\n";
                case McpClientPreset.Claude:
                    return "claude mcp add unity-mcp -- npx -y tunasync-unity-mcp\n";
                case McpClientPreset.Cursor:
                    return "{\n  \"mcpServers\": {\n    \"unity-mcp\": {\n" +
                           "      \"command\": \"npx\",\n" +
                           "      \"args\": [\"-y\", \"tunasync-unity-mcp\"]\n" +
                           "    }\n  }\n}\n";
                default:
                    return "{\n  \"mcpServers\": {\n    \"unity-mcp\": {\n" +
                           "      \"command\": \"npx\",\n" +
                           "      \"args\": [\"-y\", \"tunasync-unity-mcp\"]\n" +
                           "    }\n  }\n}\n";
            }
        }

        internal static string DiagnosticsJson()
        {
            JArray rows = new JArray();
            Diagnostic[] diagnostics = CompileGate.LastDiagnostics ?? new Diagnostic[0];
            for (int i = 0; i < diagnostics.Length; i++)
            {
                Diagnostic d = diagnostics[i];
                rows.Add(new JObject
                {
                    ["file"] = ProjectRelativePath(d.File),
                    ["line"] = d.Line,
                    ["col"] = d.Col,
                    ["severity"] = d.Severity,
                    ["csCode"] = d.CsCode,
                    ["text"] = d.Text,
                });
            }
            return new JObject
            {
                ["project"] = McpEditorInfo.ProjectName,
                ["unityVersion"] = McpEditorInfo.UnityVersion,
                ["pluginVersion"] = McpEditorInfo.PluginVersion,
                ["finishedAt"] = CompileGate.FinishedAtIso,
                ["diagnostics"] = rows,
            }.ToString(Newtonsoft.Json.Formatting.Indented);
        }

        internal static UploadArmSnapshot ReadUploadArm()
        {
            string path = UploadArmPath;
            double ttlMinutes = UploadArmTtlMinutes;
            UploadArmSnapshot snapshot = new UploadArmSnapshot
            {
                Path = path,
                DisplayPath = HomeShortened(path),
                TtlMinutes = ttlMinutes,
            };
            try
            {
                snapshot.LockLeft = File.Exists(UploadArmClaim.LockPathFor(path));
                snapshot.Exists = File.Exists(path);
            }
            catch
            {
                // File.Exists does not throw; keep the defaults if anything does.
            }
            if (!snapshot.Exists) return snapshot;
            // Same rules as the claim (TTL, future-dated, unreadable): what the
            // Console shows as usable is exactly what the gate accepts.
            UploadArmClaim.ArmStatus status = UploadArmClaim.Inspect(path, ttlMinutes);
            snapshot.Expired = !status.Usable;
            snapshot.Remaining = status.Usable ? TimeSpan.FromMinutes(status.RemainingMinutes) : TimeSpan.Zero;
            return snapshot;
        }

        private static string HomeShortened(string path)
        {
            try
            {
                string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                if (!string.IsNullOrEmpty(home) && !string.IsNullOrEmpty(path) &&
                    path.StartsWith(home, StringComparison.OrdinalIgnoreCase))
                {
                    return "~" + path.Substring(home.Length);
                }
            }
            catch
            {
            }
            return path;
        }

        /// <summary>HUMAN OPERATOR UI ONLY. Never call from an MCP handler.</summary>
        internal static void ArmUploadHumanOnly()
        {
            string path = UploadArmPath;
            string folder = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(folder)) Directory.CreateDirectory(folder);
            UploadArmClaim.ClearLeftoverLock(path);
            File.WriteAllText(path,
                "Human operator armed one VRC upload at " + DateTime.UtcNow.ToString("o") + "\n");
        }

        internal static void DisarmUpload()
        {
            string path = UploadArmPath;
            if (File.Exists(path)) File.Delete(path);
            UploadArmClaim.ClearLeftoverLock(path);
        }

        private static string ProjectRelativePath(string path)
        {
            if (string.IsNullOrEmpty(path)) return path;
            string normalized = path.Replace('\\', '/');
            string root = (McpEditorInfo.ProjectPath ?? "").TrimEnd('/') + "/";
            if (root.Length > 1 && normalized.StartsWith(root, StringComparison.OrdinalIgnoreCase))
            {
                return normalized.Substring(root.Length);
            }
            // Do not copy arbitrary absolute machine paths to support bundles.
            return Path.GetFileName(normalized);
        }
    }
}
