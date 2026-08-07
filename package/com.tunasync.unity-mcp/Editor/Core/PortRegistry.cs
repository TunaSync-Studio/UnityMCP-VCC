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
        private static bool _started;

        public static string RegistryDir => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "UnityMCP", "registry");

        public static string FilePath => _filePath;

        /// <summary>
        /// Main thread (Bootstrap, after TcpHost bound). Builds the entry from
        /// the cached editor info, then writes + sweeps on a background thread.
        /// </summary>
        public static void Start(int port, string token)
        {
            if (_started) return;
            _started = true;

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

            Thread t = new Thread(WriteAndSweep)
            {
                IsBackground = true,
                Name = "UnityMCP-Registry",
            };
            t.Start();

            MainThreadPump.AddTicker(Tick);
        }

        /// <summary>Editor quit: remove our entry. Main thread; fast.</summary>
        public static void DeleteNow()
        {
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
            if (_filePath == null || _cachedJson == null) return;
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

        // Background thread (file IO only, no Unity API).
        private static void WriteAndSweep()
        {
            try
            {
                WriteAtomic();
                SweepDeadSiblings();
            }
            catch (Exception ex)
            {
                Debug.LogError("[UnityMCP] registry startup failed: " + ex);
            }
        }

        private static void WriteAtomic()
        {
            Directory.CreateDirectory(RegistryDir);
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
