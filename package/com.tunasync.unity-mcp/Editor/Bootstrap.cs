// Plugin entry point.
// [InitializeOnLoad] static ctor runs on the main thread at editor start and
// after every domain reload. Start decision, in priority order:
//   1. UnityMCP.disabled marker        -> off (log once).
//   2. Consent file enabled:false      -> off (log once; menu can re-enable).
//      Consent file enabled:true       -> start.
//   3. No consent + UNITY_MCP_AUTOCONSENT=1 -> record consent, start (fleet/CI).
//   4. No consent + batchmode          -> off, one log line.
//   5. No consent + GUI                -> consent dialog via delayCall (never
//      blocks InitializeOnLoad); Enable starts immediately.
// StartServices is idempotent and also reachable from the menu/status window
// so enabling mid-session needs no domain reload.
using System;
using System.IO;
using UnityEditor;
using UnityEngine;
using Debug = UnityEngine.Debug;
using Process = System.Diagnostics.Process;

namespace TunaSync.UnityMCP.Editor
{
    /// <summary>
    /// Static editor/project facts captured once on the main thread so that
    /// transport threads (welcome, HTTP health, registry) never have to call
    /// into the Unity API.
    /// </summary>
    public static class McpEditorInfo
    {
        public const string PluginVersion = "2.4.3";

        private const string SessionIdKey = "TunaSync.UnityMCP.SessionId.v1";
        private const string ReloadCountKey = "TunaSync.UnityMCP.ReloadCount.v1";

        public static string ProjectPath { get; private set; }
        public static string ProjectName { get; private set; }
        public static string UnityVersion { get; private set; }
        public static int Pid { get; private set; }
        public static string EditorSessionId { get; private set; }
        public static int DomainReloadCount { get; private set; }
        public static string StartedAtIso { get; private set; }
        /// <summary>Cached at bootstrap so transport threads may read it (no Unity API).</summary>
        public static bool IsBatchMode { get; private set; }

        public static string DisabledMarkerPath =>
            ProjectPath != null ? ProjectPath + "/UnityMCP.disabled" : null;

        public static bool DisabledMarkerExists =>
            DisabledMarkerPath != null && File.Exists(DisabledMarkerPath);

        /// <summary>Main thread only (Bootstrap).</summary>
        internal static void Capture()
        {
            ProjectPath = Directory.GetParent(Application.dataPath).FullName.Replace('\\', '/');
            ProjectName = Path.GetFileName(ProjectPath);
            UnityVersion = Application.unityVersion;
            IsBatchMode = Application.isBatchMode;
            using (Process p = Process.GetCurrentProcess())
            {
                Pid = p.Id;
            }
            StartedAtIso = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'");

            string sid = SessionState.GetString(SessionIdKey, "");
            if (string.IsNullOrEmpty(sid))
            {
                sid = Guid.NewGuid().ToString();
                SessionState.SetString(SessionIdKey, sid);
            }
            EditorSessionId = sid;

            // Persisted + incremented per domain reload: first load of the
            // editor session is 0, each reload adds 1.
            int prev;
            if (!int.TryParse(SessionState.GetString(ReloadCountKey, ""), out prev)) prev = -1;
            DomainReloadCount = prev + 1;
            SessionState.SetString(ReloadCountKey, DomainReloadCount.ToString());
        }
    }

    [InitializeOnLoad]
    internal static class Bootstrap
    {
        private const string DisabledLoggedKey = "TunaSync.UnityMCP.DisabledLogged.v1";
        private const string ConsentOffLoggedKey = "TunaSync.UnityMCP.ConsentOffLogged.v1";
        private const string AutoConsentEnvVar = "UNITY_MCP_AUTOCONSENT";

        private static bool _started;

        internal static bool IsStarted => _started;

        static Bootstrap()
        {
            try
            {
                Init();
            }
            catch (Exception ex)
            {
                Debug.LogError("[UnityMCP] bootstrap failed: " + ex);
            }
        }

        private static void Init()
        {
            McpEditorInfo.Capture();

            // 0. Never run inside AssetImportWorker child processes. They share
            // the project (and its consent record) but have no editor loop, and
            // they start AFTER the main editor - so a worker's registry write
            // clobbers the real entry and clients connect into a process that
            // can only ever answer BUSY_MODAL. Registry invariant: one project,
            // one entry, written by the MAIN editor only.
            // (Do NOT gate on Application.isBatchMode here: legitimate headless
            // editors with UNITY_MCP_AUTOCONSENT=1 must still start.)
            if (IsAssetImportWorker()) return; // silent: one log per worker is just noise

            // 1. Kill switch marker: highest priority, overrides consent.
            if (McpEditorInfo.DisabledMarkerExists)
            {
                if (SessionState.GetString(DisabledLoggedKey, "") != "1")
                {
                    SessionState.SetString(DisabledLoggedKey, "1");
                    Debug.Log("[UnityMCP] disabled by UnityMCP.disabled marker; not listening.");
                }
                return;
            }
            SessionState.EraseString(DisabledLoggedKey);

            // 2. Recorded consent decides.
            ConsentStore.ConsentState consent = ConsentStore.Read();
            if (consent == ConsentStore.ConsentState.Enabled)
            {
                StartServices();
                return;
            }
            if (consent == ConsentStore.ConsentState.Disabled)
            {
                if (SessionState.GetString(ConsentOffLoggedKey, "") != "1")
                {
                    SessionState.SetString(ConsentOffLoggedKey, "1");
                    Debug.Log("[UnityMCP] not enabled for this project (consent declined). " +
                              "Enable via Tools > TunaSync Unity MCP > Enable For This Project.");
                }
                return;
            }

            // 3. No decision yet: fleet/CI auto-consent.
            if (Environment.GetEnvironmentVariable(AutoConsentEnvVar) == "1")
            {
                ConsentStore.Write(true);
                StartServices();
                return;
            }

            // 4. Headless without consent: never prompt, never start.
            if (Application.isBatchMode)
            {
                Debug.Log("[UnityMCP] no consent recorded; run once in the GUI editor or set " +
                          AutoConsentEnvVar + "=1");
                return;
            }

            // 5. GUI: ask once, off the InitializeOnLoad stack.
            EditorApplication.delayCall += PromptForConsent;
        }

        private static bool IsAssetImportWorker()
        {
            string[] args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "-adb2") return true;
                if (args[i] == "-name" && i + 1 < args.Length &&
                    args[i + 1].StartsWith("AssetImportWorker", StringComparison.Ordinal))
                {
                    return true;
                }
            }
            return false;
        }

        // Main thread (delayCall). Modal dialog is fine here.
        private static void PromptForConsent()
        {
            try
            {
                if (_started) return;
                if (ConsentStore.Read() != ConsentStore.ConsentState.Unknown) return; // decided meanwhile

                bool enable = EditorUtility.DisplayDialog(
                    "TunaSync Unity MCP",
                    "Enable the local MCP bridge for this project?\n\n" +
                    "It lets local AI tools (MCP clients) drive this Unity Editor through a " +
                    "loopback-only socket on 127.0.0.1. Nothing is exposed to the network and " +
                    "nothing starts without this consent.\n\n" +
                    "You can change this anytime via Tools > TunaSync Unity MCP.",
                    "Enable",
                    "Not now");
                ConsentStore.Write(enable);
                if (enable)
                {
                    StartServices();
                }
                else
                {
                    Debug.Log("[UnityMCP] not enabled for this project. " +
                              "Enable via Tools > TunaSync Unity MCP > Enable For This Project.");
                }
            }
            catch (Exception ex)
            {
                Debug.LogError("[UnityMCP] consent prompt failed: " + ex);
            }
        }

        /// <summary>
        /// Full service start (subsystems, handlers, listener, registry, jobs,
        /// teardown hooks). Main thread only. Idempotent, so the menu and the
        /// status window can call it after a mid-session consent grant.
        /// </summary>
        internal static void StartServices()
        {
            if (_started) return;
            if (McpEditorInfo.DisabledMarkerExists)
            {
                Debug.LogWarning("[UnityMCP] UnityMCP.disabled marker present; not starting.");
                return;
            }
            _started = true;
            SessionState.EraseString(ConsentOffLoggedKey);

            MainThreadPump.Init();
            LogCapture.Init();
            CompileGate.Init();   // subscribes beforeAssemblyReload FIRST: reload.imminent precedes bye
            LeaseManager.Init();
            EvalService.Init();   // probes Unity's Roslyn toolchain -> engine csc|none
            JobManager.RegisterExecutor(new DemoSleepExecutor());
            JobManager.RegisterExecutor(new EvalJobExecutor());
            SysHandlers.RegisterAll();
            EvalHandlers.RegisterAll();
            StateHandlers.RegisterAll();
            CaptureHandlers.RegisterAll();
#if MCP_NDMF
            NdmfHandlers.RegisterAll();      // ndmf.bake job executor
#endif
#if MCP_VRCSDK3_AVATARS || MCP_VRCSDK3_WORLDS
            VrcHandlers.RegisterAll();       // vrc.upload executor (+ vrc.avatarAudit)
#endif

            TcpHost host = TcpHost.Start();
            PortRegistry.Start(host.Port, host.Token);
            JobManager.RestoreAfterReload(); // after host start: resume/fail persisted jobs

            // Registered AFTER CompileGate.Init so the ritual runs second.
            AssemblyReloadEvents.beforeAssemblyReload += OnBeforeAssemblyReload;
            EditorApplication.quitting += OnQuitting;

            Debug.Log("[UnityMCP] v" + McpEditorInfo.PluginVersion +
                      " listening on 127.0.0.1:" + host.Port +
                      " (project '" + McpEditorInfo.ProjectName +
                      "', reload #" + McpEditorInfo.DomainReloadCount + ")");
        }

        // PROTOCOL.md "Domain reload ritual". Must stay fast (<300 ms worst case):
        // SessionState writes are cheap and the socket flush is budgeted 250 ms.
        private static void OnBeforeAssemblyReload()
        {
            try
            {
                // 1. persist state (port was stored at bind).
                CompileGate.PersistNow();
                JobManager.PersistNow();
                LeaseManager.PersistNow();

                // 2. every in-flight non-job req resolves DOMAIN_RELOAD (retryable).
                Dispatcher.FailAllInFlight(ErrorCodes.DomainReload, true,
                    "editor domain reload in progress");

                // 3..5. bye {domain_reload, resumeHintMs:3000} -> flush (<=250 ms)
                //       -> close sockets -> stop listener. Registry stays on disk.
                TcpHost host = TcpHost.Current;
                if (host != null) host.StopWithBye("domain_reload", 3000, 250);
            }
            catch (Exception ex)
            {
                Debug.LogError("[UnityMCP] reload ritual failed: " + ex);
            }
        }

        private static void OnQuitting()
        {
            try
            {
                TcpHost host = TcpHost.Current;
                if (host != null) host.StopWithBye("quit", null, 250);
                PortRegistry.DeleteNow();
            }
            catch (Exception ex)
            {
                Debug.LogError("[UnityMCP] quit teardown failed: " + ex);
            }
        }
    }
}
