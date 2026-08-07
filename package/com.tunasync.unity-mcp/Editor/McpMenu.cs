// Editor menu: one-line status log and the UnityMCP.disabled kill-switch toggle.
using System.IO;
using UnityEditor;
using UnityEngine;

namespace TunaSync.UnityMCP.Editor
{
    internal static class McpMenu
    {
        [MenuItem("Tools/TunaSync Unity MCP/Status")]
        private static void ShowStatus()
        {
            TcpHost host = TcpHost.Current;
            if (host == null)
            {
                Debug.Log("[UnityMCP] not running (disabled marker present: " +
                          File.Exists(MarkerPath()) + ")");
                return;
            }
            Debug.Log("[UnityMCP] port=" + host.Port +
                      " clients=" + host.ClientCount +
                      " compiling=" + EditorApplication.isCompiling +
                      " reloads=" + McpEditorInfo.DomainReloadCount +
                      " lease=" + (LeaseManager.CurrentHolder() ?? "none"));
        }

        [MenuItem("Tools/TunaSync Unity MCP/Enable For This Project")]
        internal static void EnableForThisProject()
        {
            ConsentStore.Write(true);
            if (Bootstrap.IsStarted)
            {
                Debug.Log("[UnityMCP] already running; consent re-recorded as enabled.");
                return;
            }
            Bootstrap.StartServices(); // no-op with warning if the disabled marker is present
        }

        [MenuItem("Tools/TunaSync Unity MCP/Toggle Disabled Marker")]
        internal static void ToggleDisabledMarker()
        {
            string path = MarkerPath();
            if (File.Exists(path))
            {
                File.Delete(path);
                Debug.Log("[UnityMCP] removed " + path +
                          "; MCP will start on the next domain reload.");
            }
            else
            {
                File.WriteAllText(path,
                    "Presence of this file disables TunaSync Unity MCP" +
                    " (no listener, no registry). Delete it to re-enable.\n");
                Debug.Log("[UnityMCP] created " + path +
                          "; MCP will not start after the next domain reload" +
                          " (currently running: " + (TcpHost.Current != null) + ").");
            }
        }

        internal static string MarkerPath()
        {
            // Computed locally so the menu works even if Bootstrap bailed early.
            string projectRoot = Directory.GetParent(Application.dataPath).FullName;
            return Path.Combine(projectRoot, "UnityMCP.disabled");
        }
    }
}
