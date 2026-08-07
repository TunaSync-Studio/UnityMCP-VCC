// First-run consent store (per user x per project).
// %LOCALAPPDATA%\UnityMCP\consent\<fnv1a32-hex8-of-normalized-project-path>.json
//   {"schemaVersion":1,"enabled":true|false,"decidedAt":"iso"}
// Same hashing/filename scheme as the discovery registry (Protocol helpers).
// The listener never auto-starts for a user who has not agreed; Bootstrap
// consults this before TcpHost.Start.
using System;
using System.IO;
using System.Text;
using Newtonsoft.Json;
using Debug = UnityEngine.Debug;

namespace TunaSync.UnityMCP.Editor
{
    public static class ConsentStore
    {
        public enum ConsentState
        {
            Unknown = 0,   // no file (or unreadable): never asked
            Enabled = 1,
            Disabled = 2,
        }

        private const int SchemaVersion = 1;

        public static string ConsentDir => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "UnityMCP", "consent");

        public static string FilePath => Path.Combine(
            ConsentDir, Protocol.RegistryFileName(McpEditorInfo.ProjectPath));

        /// <summary>Read the recorded decision. Corrupt/missing file = Unknown (re-promptable).</summary>
        public static ConsentState Read()
        {
            try
            {
                string path = FilePath;
                if (!File.Exists(path)) return ConsentState.Unknown;
                ConsentFile dto = JsonConvert.DeserializeObject<ConsentFile>(
                    File.ReadAllText(path), Protocol.JsonSettings);
                if (dto == null) return ConsentState.Unknown;
                return dto.Enabled ? ConsentState.Enabled : ConsentState.Disabled;
            }
            catch
            {
                return ConsentState.Unknown;
            }
        }

        /// <summary>Record a decision (atomic write: temp + File.Replace).</summary>
        public static void Write(bool enabled)
        {
            try
            {
                Directory.CreateDirectory(ConsentDir);
                string json = Protocol.Serialize(new ConsentFile
                {
                    SchemaVersion = ConsentStore.SchemaVersion,
                    Enabled = enabled,
                    DecidedAt = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'"),
                });
                string path = FilePath;
                string tmp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
                File.WriteAllText(tmp, json, new UTF8Encoding(false));
                try
                {
                    if (File.Exists(path)) File.Replace(tmp, path, null);
                    else File.Move(tmp, path);
                }
                catch (IOException)
                {
                    File.Copy(tmp, path, true);
                    TryDelete(tmp);
                }
                catch (UnauthorizedAccessException)
                {
                    File.Copy(tmp, path, true);
                    TryDelete(tmp);
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning("[UnityMCP] failed to write consent file: " + ex.Message);
            }
        }

        private static void TryDelete(string path)
        {
            try { File.Delete(path); } catch { }
        }

        private sealed class ConsentFile
        {
            [JsonProperty("schemaVersion")] public int SchemaVersion = ConsentStore.SchemaVersion;
            [JsonProperty("enabled")] public bool Enabled;
            [JsonProperty("decidedAt")] public string DecidedAt;
        }
    }
}
