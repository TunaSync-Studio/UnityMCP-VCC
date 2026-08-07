// Dockable status panel (v2.4.0 redesign) - the "am I connected?" surface.
// At-a-glance state dot + connection facts + connected client names + the
// last real command, with setup helpers (copy MCP config / health URL,
// open the discovery registry) and an EN/JA language toggle (McpLoc).
// Repaints only while visible and only when the snapshot changed
// (v1 had a high-CPU always-repaint bug).
using System;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace TunaSync.UnityMCP.Editor
{
    public sealed class McpStatusWindow : EditorWindow
    {
        private string _lastLine;
        private double _nextPoll;
        private double _toastUntil;
        private string _toast;

        [MenuItem("Tools/TunaSync Unity MCP/Status Window")]
        public static void Open()
        {
            McpStatusWindow w = GetWindow<McpStatusWindow>(false, "Unity MCP", true);
            w.minSize = new Vector2(260f, 190f);
            w.Show();
        }

        private void OnEnable()
        {
            EditorApplication.update += Poll;
        }

        private void OnDisable()
        {
            EditorApplication.update -= Poll;
        }

        private void Poll()
        {
            if (EditorApplication.timeSinceStartup < _nextPoll) return;
            _nextPoll = EditorApplication.timeSinceStartup + 1.0;
            string line = BuildLine();
            if (line != _lastLine)
            {
                _lastLine = line;
                Repaint();
            }
        }

        private static string BuildLine()
        {
            TcpHost host = TcpHost.Current;
            if (System.IO.File.Exists(McpMenu.MarkerPath())) return "disabled";
            if (host == null)
            {
                return ConsentStore.Read() == ConsentStore.ConsentState.Enabled
                    ? "stopped"
                    : "consent";
            }
            return "listening|" + host.Port + "|" + string.Join(",", host.ClientNames) + "|" +
                   EvalService.EngineName + "|" + (LeaseManager.CurrentHolder() ?? "-") + "|" +
                   Dispatcher.LastRequestMethod + "|" + (int)McpLoc.Preference;
        }

        private static string AgoLabel(DateTime utc)
        {
            if (utc == default) return McpLoc.Tr("label.none");
            TimeSpan ago = DateTime.UtcNow - utc;
            if (ago.TotalSeconds < 5) return "now";
            if (ago.TotalSeconds < 90) return (int)ago.TotalSeconds + "s";
            if (ago.TotalMinutes < 90) return (int)ago.TotalMinutes + "m";
            return (int)ago.TotalHours + "h";
        }

        private void OnGUI()
        {
            TcpHost host = TcpHost.Current;
            bool disabled = System.IO.File.Exists(McpMenu.MarkerPath());
            bool consentGated = !disabled && host == null &&
                ConsentStore.Read() != ConsentStore.ConsentState.Enabled;

            Color dot = disabled || consentGated ? new Color(0.6f, 0.6f, 0.6f)
                : host != null && host.ClientCount > 0 ? new Color(0.2f, 0.85f, 0.3f)
                : host != null ? new Color(0.95f, 0.75f, 0.1f)
                : new Color(0.9f, 0.25f, 0.2f);
            string headline = disabled ? McpLoc.Tr("status.disabled")
                : consentGated ? McpLoc.Tr("status.consent")
                : host != null && host.ClientCount > 0 ? McpLoc.Tr("status.connected")
                : host != null ? McpLoc.Tr("status.listening")
                : McpLoc.Tr("status.notRunning");

            // ---- header: big dot + headline, version + language on the right
            EditorGUILayout.Space(8f);
            using (new EditorGUILayout.HorizontalScope())
            {
                Rect r = GUILayoutUtility.GetRect(18f, 18f, GUILayout.Width(22f));
                Rect dotRect = new Rect(r.x + 3f, r.y + 2f, 13f, 13f);
                Color shadow = new Color(0f, 0f, 0f, 0.25f);
                EditorGUI.DrawRect(new Rect(dotRect.x + 1f, dotRect.y + 1f, 13f, 13f), shadow);
                EditorGUI.DrawRect(dotRect, dot);
                GUIStyle head = new GUIStyle(EditorStyles.boldLabel) { fontSize = 13 };
                EditorGUILayout.LabelField(headline, head);
                GUILayout.FlexibleSpace();
                GUIStyle ver = new GUIStyle(EditorStyles.miniLabel)
                {
                    alignment = TextAnchor.MiddleRight,
                };
                GUILayout.Label("v" + McpEditorInfo.PluginVersion, ver, GUILayout.Width(52f));
                if (GUILayout.Button(McpLoc.PreferenceLabel, EditorStyles.miniButton, GUILayout.Width(58f)))
                {
                    McpLoc.CyclePreference();
                    _lastLine = null; // force refresh
                }
            }

            // ---- facts box
            if (!disabled)
            {
                using (new EditorGUILayout.VerticalScope("HelpBox"))
                {
                    EditorGUILayout.LabelField(McpLoc.Tr("label.project"), McpEditorInfo.ProjectName);
                    if (host != null)
                    {
                        EditorGUILayout.LabelField(McpLoc.Tr("label.port"), "127.0.0.1:" + host.Port);

                        string[] names = host.ClientNames;
                        string clientsValue = names.Length == 0
                            ? "0"
                            : names.Length + "  (" + string.Join(", ", names) + ")";
                        EditorGUILayout.LabelField(McpLoc.Tr("label.clients"), clientsValue);

                        EditorGUILayout.LabelField(McpLoc.Tr("label.engine"), EvalService.EngineName);

                        string holder = LeaseManager.CurrentHolder();
                        EditorGUILayout.LabelField(
                            McpLoc.Tr("label.lease"),
                            string.IsNullOrEmpty(holder) ? McpLoc.Tr("label.leaseFree") : Shorten(holder));

                        string last = Dispatcher.LastRequestMethod;
                        EditorGUILayout.LabelField(
                            McpLoc.Tr("label.lastCommand"),
                            string.IsNullOrEmpty(last)
                                ? McpLoc.Tr("label.none")
                                : last + "  (" + AgoLabel(Dispatcher.LastRequestAtUtc) + ")");
                    }
                }
            }

            EditorGUILayout.Space(2f);

            // ---- actions
            if (consentGated)
            {
                if (GUILayout.Button(McpLoc.Tr("btn.enableProject"), GUILayout.Height(24f)))
                {
                    McpMenu.EnableForThisProject();
                }
            }
            using (new EditorGUILayout.HorizontalScope())
            {
                if (GUILayout.Button(disabled ? McpLoc.Tr("btn.enableMarker") : McpLoc.Tr("btn.disableMarker")))
                {
                    McpMenu.ToggleDisabledMarker();
                }
                using (new EditorGUI.DisabledScope(host == null))
                {
                    if (GUILayout.Button(McpLoc.Tr("btn.copyHealth")) && host != null)
                    {
                        EditorGUIUtility.systemCopyBuffer = "http://127.0.0.1:" + host.Port + "/";
                    }
                }
            }
            if (GUILayout.Button(McpLoc.Tr("btn.copyMcpConfig")))
            {
                EditorGUIUtility.systemCopyBuffer = BuildMcpConfigJson();
                _toast = McpLoc.Tr("toast.mcpConfigCopied");
                _toastUntil = EditorApplication.timeSinceStartup + 4.0;
            }

            if (_toast != null && EditorApplication.timeSinceStartup < _toastUntil)
            {
                EditorGUILayout.HelpBox(_toast, MessageType.Info);
            }

            EditorGUILayout.Space(2f);
            EditorGUILayout.LabelField(
                consentGated ? McpLoc.Tr("hint.consent") : McpLoc.Tr("hint.zeroTouch"),
                EditorStyles.miniLabel);
        }

        private static string Shorten(string sessionId)
        {
            return sessionId.Length > 13 ? sessionId.Substring(0, 13) + "…" : sessionId;
        }

        private static string BuildMcpConfigJson()
        {
            // Ready-to-paste MCP client registration (npx distribution).
            StringBuilder sb = new StringBuilder(160);
            sb.Append("{\n  \"mcpServers\": {\n    \"unity-mcp\": {\n");
            sb.Append("      \"command\": \"npx\",\n");
            sb.Append("      \"args\": [\"-y\", \"tunasync-unity-mcp\"]\n");
            sb.Append("    }\n  }\n}\n");
            return sb.ToString();
        }
    }
}
