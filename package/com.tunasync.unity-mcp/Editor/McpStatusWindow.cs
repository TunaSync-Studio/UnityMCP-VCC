// Dockable operator console for connection, jobs, compilation, client setup,
// diagnostics and the human-only VRC upload arm gate.  IMGUI is intentional:
// Unity 2022.3 compatibility and a single battle-tested implementation matter
// more here than a parallel UI Toolkit surface.
using System;
using UnityEditor;
using UnityEngine;

namespace TunaSync.UnityMCP.Editor
{
    public sealed class McpStatusWindow : EditorWindow
    {
        private Vector2 _scroll;
        private double _nextPoll;
        private double _toastUntil;
        private string _toast;
        private McpClientPreset _preset = McpClientPreset.Codex;
        private GUIStyle _wrapped;
        private GUIStyle _section;

        [MenuItem("Tools/TunaSync Unity MCP/Creator Console")]
        [MenuItem("Tools/TunaSync Unity MCP/Status Window")]
        public static void Open()
        {
            McpStatusWindow window = GetWindow<McpStatusWindow>(false, "Unity MCP", true);
            window.minSize = new Vector2(380f, 440f);
            window.Show();
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
            // One hertz keeps relative times, job progress, arm TTL and toast
            // expiry truthful without restoring the old always-repaint bug.
            Repaint();
        }

        private void EnsureStyles()
        {
            if (_wrapped != null) return;
            _wrapped = new GUIStyle(EditorStyles.wordWrappedLabel);
            _section = new GUIStyle(EditorStyles.boldLabel) { fontSize = 12 };
        }

        private void OnGUI()
        {
            EnsureStyles();
            TcpHost host = TcpHost.Current;
            bool disabled = System.IO.File.Exists(McpMenu.MarkerPath());
            bool consentGated = !disabled && host == null &&
                ConsentStore.Read() != ConsentStore.ConsentState.Enabled;

            _scroll = EditorGUILayout.BeginScrollView(_scroll);
            DrawHeader(host, disabled, consentGated);
            DrawRuntime(host, disabled);
            DrawClients(host);
            DrawJobs();
            DrawCompile();
            DrawControls(host, disabled, consentGated);
            DrawSetup();
            DrawUploadArm();

            if (!string.IsNullOrEmpty(_toast) && EditorApplication.timeSinceStartup < _toastUntil)
            {
                EditorGUILayout.HelpBox(_toast, MessageType.Info);
            }
            EditorGUILayout.Space(8f);
            EditorGUILayout.EndScrollView();
        }

        private void DrawHeader(TcpHost host, bool disabled, bool consentGated)
        {
            Color dot = disabled || consentGated ? new Color(0.55f, 0.55f, 0.55f)
                : host != null && host.ClientCount > 0 ? new Color(0.2f, 0.85f, 0.3f)
                : host != null ? new Color(0.95f, 0.7f, 0.1f)
                : new Color(0.9f, 0.25f, 0.2f);
            string headline = disabled ? McpLoc.Tr("status.disabled")
                : consentGated ? McpLoc.Tr("status.consent")
                : host != null && host.ClientCount > 0 ? McpLoc.Tr("status.connected")
                : host != null ? McpLoc.Tr("status.listening")
                : McpLoc.Tr("status.notRunning");

            EditorGUILayout.Space(8f);
            using (new EditorGUILayout.HorizontalScope())
            {
                Rect r = GUILayoutUtility.GetRect(18f, 18f, GUILayout.Width(22f));
                EditorGUI.DrawRect(new Rect(r.x + 3f, r.y + 2f, 13f, 13f), dot);
                GUIStyle head = new GUIStyle(EditorStyles.boldLabel) { fontSize = 14 };
                EditorGUILayout.LabelField(headline, head);
                GUILayout.FlexibleSpace();
                GUILayout.Label("v" + McpEditorInfo.PluginVersion, EditorStyles.miniLabel);
                if (GUILayout.Button(McpLoc.PreferenceLabel, EditorStyles.miniButton, GUILayout.Width(58f)))
                {
                    McpLoc.CyclePreference();
                }
            }
            EditorGUILayout.LabelField(McpLoc.Tr("header.subtitle"), _wrapped);
        }

        private void DrawRuntime(TcpHost host, bool disabled)
        {
            Section(McpLoc.Tr("section.runtime"));
            using (new EditorGUILayout.VerticalScope("HelpBox"))
            {
                Row(McpLoc.Tr("label.project"), McpEditorInfo.ProjectName);
                Row("Unity", McpEditorInfo.UnityVersion + "  ·  protocol v" + Protocol.Version);
                Row(McpLoc.Tr("label.transport"), host == null
                    ? (disabled ? McpLoc.Tr("status.disabled") : McpLoc.Tr("status.notRunning"))
                    : "127.0.0.1:" + host.Port + "  ·  " + EvalService.EngineName);
                MainThreadPump.Snapshot snap = MainThreadPump.Current;
                string editor = CompileGate.State.ToString() + "  ·  " +
                    ((snap != null && snap.IsPlaying) ? "Play Mode" : "Edit Mode") +
                    "  ·  reload #" + McpEditorInfo.DomainReloadCount;
                Row(McpLoc.Tr("label.editor"), editor);
                string last = Dispatcher.LastRequestMethod;
                Row(McpLoc.Tr("label.lastCommand"), string.IsNullOrEmpty(last)
                    ? McpLoc.Tr("label.none")
                    : last + "  (" + AgoLabel(Dispatcher.LastRequestAtUtc) + ")");
            }
        }

        private void DrawClients(TcpHost host)
        {
            Section(McpLoc.Tr("section.clients"));
            using (new EditorGUILayout.VerticalScope("HelpBox"))
            {
                TcpHost.ClientInfo[] clients = host != null ? host.Clients : new TcpHost.ClientInfo[0];
                if (clients.Length == 0)
                {
                    EditorGUILayout.LabelField(McpLoc.Tr("clients.none"), _wrapped);
                    return;
                }
                string holder = LeaseManager.CurrentHolder();
                for (int i = 0; i < clients.Length; i++)
                {
                    TcpHost.ClientInfo client = clients[i];
                    bool ownsLease = !string.IsNullOrEmpty(holder) && holder == client.SessionId;
                    string detail = "v" + (client.Version ?? "?") +
                        (client.Pid.HasValue ? "  ·  PID " + client.Pid.Value : "") +
                        "  ·  " + Shorten(client.SessionId) +
                        (ownsLease ? "  ·  WRITE LEASE" : "");
                    EditorGUILayout.LabelField((client.Name ?? "unknown") + " — " + detail, _wrapped);
                }
            }
        }

        private void DrawJobs()
        {
            Section(McpLoc.Tr("section.jobs"));
            using (new EditorGUILayout.VerticalScope("HelpBox"))
            {
                JobRecord[] jobs = JobManager.AllRecords();
                if (jobs.Length == 0)
                {
                    EditorGUILayout.LabelField(McpLoc.Tr("jobs.none"), _wrapped);
                    return;
                }
                int first = Math.Max(0, jobs.Length - 5);
                for (int i = jobs.Length - 1; i >= first; i--)
                {
                    JobRecord job = jobs[i];
                    using (new EditorGUILayout.HorizontalScope())
                    {
                        EditorGUILayout.LabelField(job.Method + "  ·  " + job.State, _wrapped);
                        using (new EditorGUI.DisabledScope(JobState.IsTerminal(job.State)))
                        {
                            if (GUILayout.Button(McpLoc.Tr("btn.cancel"), GUILayout.Width(64f)) &&
                                EditorUtility.DisplayDialog("Unity MCP", McpLoc.Tr("dialog.cancelJob"),
                                    McpLoc.Tr("btn.cancel"), McpLoc.Tr("btn.keep")))
                            {
                                JobManager.Cancel(job.JobId);
                            }
                        }
                    }
                    if (job.Pct.HasValue)
                    {
                        Rect progress = GUILayoutUtility.GetRect(10f, 16f, GUILayout.ExpandWidth(true));
                        EditorGUI.ProgressBar(progress,
                            Mathf.Clamp01((float)(job.Pct.Value / 100.0)),
                            Math.Round(job.Pct.Value) + "%  " + (job.Phase ?? job.Message ?? ""));
                    }
                    else if (!string.IsNullOrEmpty(job.Message))
                    {
                        EditorGUILayout.LabelField(job.Message, EditorStyles.miniLabel);
                    }
                    if (i > first) EditorGUILayout.Space(3f);
                }
            }
        }

        private void DrawCompile()
        {
            Section(McpLoc.Tr("section.compile"));
            Diagnostic[] diagnostics = CompileGate.LastDiagnostics ?? new Diagnostic[0];
            int errors = 0;
            for (int i = 0; i < diagnostics.Length; i++)
            {
                if (diagnostics[i].Severity == "error") errors++;
            }
            using (new EditorGUILayout.VerticalScope("HelpBox"))
            {
                Row(McpLoc.Tr("label.compileState"), CompileGate.State.ToString());
                Row(McpLoc.Tr("label.diagnostics"), errors + " errors  ·  " +
                    (diagnostics.Length - errors) + " warnings" +
                    (string.IsNullOrEmpty(CompileGate.FinishedAtIso) ? "" :
                        "  ·  " + AgoIso(CompileGate.FinishedAtIso)));
                using (new EditorGUI.DisabledScope(diagnostics.Length == 0))
                {
                    if (GUILayout.Button(McpLoc.Tr("btn.copyDiagnostics")))
                    {
                        EditorGUIUtility.systemCopyBuffer = McpUiModel.DiagnosticsJson();
                        Toast(McpLoc.Tr("toast.diagnosticsCopied"));
                    }
                }
            }
        }

        private void DrawControls(TcpHost host, bool disabled, bool consentGated)
        {
            Section(McpLoc.Tr("section.controls"));
            if (consentGated && GUILayout.Button(McpLoc.Tr("btn.enableProject"), GUILayout.Height(25f)))
            {
                McpMenu.EnableForThisProject();
            }
            using (new EditorGUILayout.HorizontalScope())
            {
                if (GUILayout.Button(disabled ? McpLoc.Tr("btn.enableNow") : McpLoc.Tr("btn.disableNow"),
                    GUILayout.Height(25f)))
                {
                    if (disabled)
                    {
                        McpMenu.SetDisabled(false);
                        Toast(McpLoc.Tr("toast.enabled"));
                    }
                    else if (EditorUtility.DisplayDialog("Unity MCP", McpLoc.Tr("dialog.disable"),
                        McpLoc.Tr("btn.disableNow"), McpLoc.Tr("btn.keep")))
                    {
                        int cancelled = McpMenu.SetDisabled(true);
                        Toast(McpLoc.Tr("toast.disabled") +
                            (cancelled > 0 ? " (jobs: " + cancelled + ")" : ""));
                    }
                }
                using (new EditorGUI.DisabledScope(host == null))
                {
                    if (GUILayout.Button(McpLoc.Tr("btn.copyHealth"), GUILayout.Height(25f)) && host != null)
                    {
                        EditorGUIUtility.systemCopyBuffer = "http://127.0.0.1:" + host.Port + "/";
                        Toast(McpLoc.Tr("toast.healthCopied"));
                    }
                }
            }
            using (new EditorGUILayout.HorizontalScope())
            {
                if (GUILayout.Button(McpLoc.Tr("btn.openRegistry")))
                {
                    System.IO.Directory.CreateDirectory(PortRegistry.RegistryDir);
                    EditorUtility.RevealInFinder(PortRegistry.RegistryDir);
                }
                if (GUILayout.Button(McpLoc.Tr("btn.openDocs")))
                {
                    Application.OpenURL("https://github.com/TunaSync-Studio/UnityMCP-VCC");
                }
            }
        }

        private void DrawSetup()
        {
            Section(McpLoc.Tr("section.setup"));
            using (new EditorGUILayout.VerticalScope("HelpBox"))
            {
                string[] labels = { "Codex", "Claude", "Cursor", "JSON" };
                _preset = (McpClientPreset)GUILayout.Toolbar((int)_preset, labels);
                EditorGUILayout.SelectableLabel(McpUiModel.ConfigText(_preset),
                    EditorStyles.textArea, GUILayout.MinHeight(_preset == McpClientPreset.Codex ? 106f : 58f));
                if (GUILayout.Button(McpLoc.Tr("btn.copySetup") + " — " + McpUiModel.PresetLabel(_preset)))
                {
                    EditorGUIUtility.systemCopyBuffer = McpUiModel.ConfigText(_preset);
                    Toast(McpLoc.Tr("toast.mcpConfigCopied"));
                }
            }
        }

        private void DrawUploadArm()
        {
            Section(McpLoc.Tr("section.upload"));
            UploadArmSnapshot arm = McpUiModel.ReadUploadArm();
            MessageType type = arm.Exists && !arm.Expired ? MessageType.Warning : MessageType.Info;
            string state = !arm.Exists ? McpLoc.Tr("upload.disarmed")
                : arm.Expired ? McpLoc.Tr("upload.expired")
                : McpLoc.Tr("upload.armed") + "  ·  " +
                    Math.Max(1, (int)Math.Ceiling(arm.Remaining.TotalMinutes)) + " min";
            EditorGUILayout.HelpBox(state + "\n" + McpLoc.Tr("upload.explain"), type);
            using (new EditorGUILayout.HorizontalScope())
            {
                using (new EditorGUI.DisabledScope(arm.Exists && !arm.Expired))
                {
                    if (GUILayout.Button(McpLoc.Tr("btn.armUpload"), GUILayout.Height(25f)) &&
                        EditorUtility.DisplayDialog("VRC Upload Safety Gate",
                            McpLoc.Tr("dialog.armUpload"), McpLoc.Tr("btn.armUpload"), McpLoc.Tr("btn.keep")))
                    {
                        McpUiModel.ArmUploadHumanOnly();
                        Toast(McpLoc.Tr("toast.uploadArmed"));
                    }
                }
                using (new EditorGUI.DisabledScope(!arm.Exists))
                {
                    if (GUILayout.Button(McpLoc.Tr("btn.disarmUpload"), GUILayout.Height(25f)))
                    {
                        McpUiModel.DisarmUpload();
                        Toast(McpLoc.Tr("toast.uploadDisarmed"));
                    }
                }
            }
        }

        private void Section(string text)
        {
            EditorGUILayout.Space(8f);
            EditorGUILayout.LabelField(text, _section);
        }

        private void Row(string label, string value)
        {
            using (new EditorGUILayout.HorizontalScope())
            {
                EditorGUILayout.LabelField(label, GUILayout.Width(112f));
                EditorGUILayout.LabelField(value ?? "—", _wrapped);
            }
        }

        private void Toast(string message)
        {
            _toast = message;
            _toastUntil = EditorApplication.timeSinceStartup + 4.0;
            Repaint();
        }

        private static string Shorten(string value)
        {
            if (string.IsNullOrEmpty(value)) return "?";
            return value.Length > 13 ? value.Substring(0, 13) + "…" : value;
        }

        private static string AgoLabel(DateTime utc)
        {
            if (utc == default(DateTime)) return McpLoc.Tr("label.none");
            TimeSpan ago = DateTime.UtcNow - utc;
            if (ago.TotalSeconds < 5) return "now";
            if (ago.TotalSeconds < 90) return (int)ago.TotalSeconds + "s ago";
            if (ago.TotalMinutes < 90) return (int)ago.TotalMinutes + "m ago";
            return (int)ago.TotalHours + "h ago";
        }

        private static string AgoIso(string iso)
        {
            DateTime value;
            return DateTime.TryParse(iso, out value) ? AgoLabel(value.ToUniversalTime()) : iso;
        }
    }
}
