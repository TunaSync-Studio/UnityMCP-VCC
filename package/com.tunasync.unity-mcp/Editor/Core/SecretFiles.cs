// H-1 (2026-08-12 audit): the discovery-registry entry and the consent file
// carry the same-user auth token. Windows' default %LOCALAPPDATA% ACL keeps
// them private, but a relocated UNITY_MCP_REGISTRY_DIR or a POSIX umask 022
// can leave them readable by other local users - and the token is exactly
// what authorizes C# execution in this editor. Best-effort tightening:
// chmod 600 (files) / 700 (dirs) on POSIX, and a one-time warning on Windows
// when the registry dir was moved out of LocalApplicationData.
using System;
using System.Diagnostics;
using Debug = UnityEngine.Debug;

namespace TunaSync.UnityMCP.Editor
{
    internal static class SecretFiles
    {
        private static bool _warnedOverride;

        /// <summary>chmod 600/700 on POSIX; no-op on Windows. Never throws.</summary>
        public static void Harden(string path, bool isDirectory = false)
        {
            try
            {
                PlatformID p = Environment.OSVersion.Platform;
                if (p != PlatformID.Unix && p != PlatformID.MacOSX) return;
                ProcessStartInfo psi = new ProcessStartInfo("chmod",
                    (isDirectory ? "700 " : "600 ") + "\"" + path + "\"")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };
                using (Process proc = Process.Start(psi))
                {
                    if (proc != null) proc.WaitForExit(2000);
                }
            }
            catch
            {
                // Permission tightening must never break the write it protects.
            }
        }

        /// <summary>
        /// Windows: the default LocalApplicationData ACL is the protection;
        /// warn once when an env override moved the secret dir elsewhere.
        /// </summary>
        public static void WarnIfRelocated(string dir, string envVarName)
        {
            if (_warnedOverride) return;
            try
            {
                if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable(envVarName))) return;
                PlatformID p = Environment.OSVersion.Platform;
                if (p == PlatformID.Unix || p == PlatformID.MacOSX) return; // chmod path covers these
                _warnedOverride = true;
                Debug.LogWarning("[UnityMCP] " + envVarName + " moved the token directory to '" +
                    dir + "' - make sure its ACL restricts other local users (the files embed " +
                    "the connection token).");
            }
            catch
            {
            }
        }
    }
}
