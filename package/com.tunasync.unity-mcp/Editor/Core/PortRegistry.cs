// Discovery registry per PROTOCOL.md:
//   %LOCALAPPDATA%\UnityMCP\registry\<fnv1a32-hex8>.json
// Written atomically (temp file + File.Replace, Copy+Delete fallback),
// mtime-touched every 60 s (pump-driven), deleted on quit, NOT deleted on
// domain reload. Startup sweeps sibling entries whose pid is dead.
using System;
using System.IO;
using System.Text;
using System.Threading;
using Newtonsoft.Json.Linq;
using Debug = UnityEngine.Debug;
using Process = System.Diagnostics.Process;

namespace TunaSync.UnityMCP.Editor
{
    internal static class PortRegistry
    {
        private static readonly long TouchIntervalTicks = 60L * TimeSpan.TicksPerSecond;

        private static string _filePath;
        private static string _cachedJson;
        private static long _lastTouchUtcTicks;
        private static bool _tickerAdded;
        private static bool _active;

        public static string RegistryDir
        {
            get
            {
                // F-4 (2.6.1): honor the same UNITY_MCP_REGISTRY_DIR override the
                // Node server has, so both sides can agree on one directory on
                // POSIX (where SpecialFolder.LocalApplicationData diverges from
                // the server's LOCALAPPDATA fallback).
                string overrideDir = Environment.GetEnvironmentVariable("UNITY_MCP_REGISTRY_DIR");
                if (!string.IsNullOrEmpty(overrideDir)) return overrideDir;
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "UnityMCP", "registry");
            }
        }

        public static string FilePath => _filePath;

        /// <summary>
        /// Main thread (Bootstrap, after TcpHost bound). Builds the entry from
        /// the cached editor info, then writes + sweeps on a background thread.
        /// </summary>
        public static void Start(int port, string token)
        {
            RegistryEntry entry = new RegistryEntry
            {
                Port = port,
                ProjectPath = McpEditorInfo.ProjectPath,
                ProjectName = McpEditorInfo.ProjectName,
                Pid = McpEditorInfo.Pid,
                UnityVersion = McpEditorInfo.UnityVersion,
                PluginVersion = McpEditorInfo.PluginVersion,
                StartedAt = McpEditorInfo.StartedAtIso,
                Token = token, // same-user auth: file is user-ACL'd
            };
            _cachedJson = Protocol.Serialize(entry);
            _filePath = Path.Combine(RegistryDir, Protocol.RegistryFileName(McpEditorInfo.ProjectPath));
            _lastTouchUtcTicks = DateTime.UtcNow.Ticks;
            _active = true;

            // The entry is small and must exist before a freshly-started
            // listener is advertised as ready.  Write it synchronously, then
            // sweep unrelated dead entries in the background.
            try { WriteAtomic(); }
            catch (Exception ex) { Debug.LogError("[UnityMCP] registry startup failed: " + ex); }

            Thread t = new Thread(SweepDeadSiblings)
            {
                IsBackground = true,
                Name = "UnityMCP-RegistrySweep",
            };
            t.Start();

            if (!_tickerAdded)
            {
                _tickerAdded = true;
                MainThreadPump.AddTicker(Tick);
            }
        }

        /// <summary>Editor quit: remove our entry. Main thread; fast.</summary>
        public static void DeleteNow()
        {
            _active = false;
            if (_filePath == null) return;
            try
            {
                if (File.Exists(_filePath)) File.Delete(_filePath);
            }
            catch (Exception ex)
            {
                Debug.LogWarning("[UnityMCP] registry delete failed: " + ex.Message);
            }
        }

        // Pump tick (main thread): touch mtime every 60 s; re-create if swept.
        private static void Tick()
        {
            if (!_active || _filePath == null || _cachedJson == null) return;
            long now = DateTime.UtcNow.Ticks;
            if (now - _lastTouchUtcTicks < TouchIntervalTicks) return;
            _lastTouchUtcTicks = now;
            try
            {
                if (File.Exists(_filePath)) File.SetLastWriteTimeUtc(_filePath, DateTime.UtcNow);
                else WriteAtomic();
            }
            catch (Exception ex)
            {
                Debug.LogWarning("[UnityMCP] registry touch failed: " + ex.Message);
            }
        }

        private static void WriteAtomic()
        {
            string dir = RegistryDir;
            Directory.CreateDirectory(dir);
            // H-1: the entry embeds the connection token.
            SecretFiles.Harden(dir, isDirectory: true);
            SecretFiles.WarnIfRelocated(dir, "UNITY_MCP_REGISTRY_DIR");
            string tmp = _filePath + "." + Guid.NewGuid().ToString("N") + ".tmp";
            File.WriteAllText(tmp, _cachedJson, new UTF8Encoding(false));
            try
            {
                if (File.Exists(_filePath))
                {
                    File.Replace(tmp, _filePath, null);
                }
                else
                {
                    File.Move(tmp, _filePath);
                }
            }
            catch (IOException)
            {
                // Replace/Move raced or is unsupported on this volume.
                File.Copy(tmp, _filePath, true);
                TryDelete(tmp);
            }
            catch (UnauthorizedAccessException)
            {
                File.Copy(tmp, _filePath, true);
                TryDelete(tmp);
            }
            SecretFiles.Harden(_filePath);
        }

        private static void SweepDeadSiblings()
        {
            string[] files;
            try
            {
                files = Directory.GetFiles(RegistryDir, "*.json");
            }
            catch
            {
                return;
            }

            string own = Path.GetFileName(_filePath);
            for (int i = 0; i < files.Length; i++)
            {
                string file = files[i];
                try
                {
                    if (string.Equals(Path.GetFileName(file), own, StringComparison.OrdinalIgnoreCase)) continue;
                    int pid = ReadPid(file);
                    if (pid <= 0 || !IsProcessAlive(pid))
                    {
                        File.Delete(file);
                    }
                }
                catch
                {
                    // Ignore per-file failures (racing editors sweeping concurrently).
                }
            }
        }

        private static int ReadPid(string file)
        {
            try
            {
                JObject jo = JObject.Parse(File.ReadAllText(file));
                JToken pid = jo["pid"];
                return pid != null ? pid.Value<int>() : -1;
            }
            catch
            {
                return -1; // malformed entry: treat as dead
            }
        }

        private static bool IsProcessAlive(int pid)
        {
            try
            {
                using (Process p = Process.GetProcessById(pid))
                {
                    return !p.HasExited;
                }
            }
            catch (ArgumentException)
            {
                return false; // no such process
            }
            catch
            {
                return true; // access denied etc: assume alive, do not delete
            }
        }

        private static void TryDelete(string path)
        {
            try { File.Delete(path); } catch { }
        }
    }
}
