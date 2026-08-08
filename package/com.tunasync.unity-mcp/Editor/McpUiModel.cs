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
    }

    internal static class McpUiModel
    {
        internal static readonly TimeSpan UploadArmTtl = TimeSpan.FromMinutes(30);

        internal static string UploadArmPath => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "UnityMCP", "arm", "vrc-upload.arm");

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
            UploadArmSnapshot snapshot = new UploadArmSnapshot { Path = path };
            try
            {
                snapshot.Exists = File.Exists(path);
                if (!snapshot.Exists) return snapshot;
                DateTime expires = File.GetLastWriteTimeUtc(path) + UploadArmTtl;
                snapshot.Remaining = expires - DateTime.UtcNow;
                snapshot.Expired = snapshot.Remaining <= TimeSpan.Zero;
                if (snapshot.Expired) snapshot.Remaining = TimeSpan.Zero;
            }
            catch
            {
                snapshot.Exists = false;
            }
            return snapshot;
        }

        /// <summary>HUMAN OPERATOR UI ONLY. Never call from an MCP handler.</summary>
        internal static void ArmUploadHumanOnly()
        {
            string path = UploadArmPath;
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllText(path,
                "Human operator armed one VRC upload at " + DateTime.UtcNow.ToString("o") + "\n");
        }

        internal static void DisarmUpload()
        {
            string path = UploadArmPath;
            if (File.Exists(path)) File.Delete(path);
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
