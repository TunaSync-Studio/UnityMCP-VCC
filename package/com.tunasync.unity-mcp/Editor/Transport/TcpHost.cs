// Loopback TcpListener host.
// Port selection per PROTOCOL.md: SessionState-stored port (rebind after
// domain reload) -> preferred (47700 + fnv1a32(projectPath) % 64) -> probe
// +1..+8 -> port 0 (OS-assigned). Accept loop runs on a background thread;
// each accepted client gets a ClientSession. StopWithBye implements steps
// 3..5 of the domain reload ritual (bye, flush <= 250 ms, close, stop).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using UnityEditor;
using Debug = UnityEngine.Debug;

namespace TunaSync.UnityMCP.Editor
{
    internal sealed class TcpHost
    {
        internal sealed class ClientInfo
        {
            public string Name;
            public string Version;
            public int? Pid;
            public string SessionId;
        }

        private const string PortKey = "TunaSync.UnityMCP.Port.v1";
        private const string TokenKey = "TunaSync.UnityMCP.Token.v1";

        public static TcpHost Current { get; private set; }

        private readonly object _sessionsGate = new object();
        private readonly List<ClientSession> _sessions = new List<ClientSession>();

        private TcpListener _listener;
        private Thread _acceptThread;
        private volatile bool _stopped;

        public int Port { get; private set; }

        /// <summary>Same-user auth token (32 hex chars); required in hello.client.token.</summary>
        public string Token { get; private set; }

        /// <summary>Handshaked clients only (HTTP probes and pre-hello sockets excluded).</summary>
        public int ClientCount
        {
            get
            {
                lock (_sessionsGate)
                {
                    int n = 0;
                    for (int i = 0; i < _sessions.Count; i++)
                    {
                        if (_sessions[i].IsReady) n++;
                    }
                    return n;
                }
            }
        }

        /// <summary>Names of handshaked clients (status window display).</summary>
        public string[] ClientNames
        {
            get
            {
                lock (_sessionsGate)
                {
                    List<string> names = new List<string>(_sessions.Count);
                    for (int i = 0; i < _sessions.Count; i++)
                    {
                        if (!_sessions[i].IsReady) continue;
                        string n = _sessions[i].ClientName;
                        names.Add(string.IsNullOrEmpty(n) ? "?" : n);
                    }
                    return names.ToArray();
                }
            }
        }

        /// <summary>Handshaked client details for the editor status UI.</summary>
        public ClientInfo[] Clients
        {
            get
            {
                lock (_sessionsGate)
                {
                    List<ClientInfo> clients = new List<ClientInfo>(_sessions.Count);
                    for (int i = 0; i < _sessions.Count; i++)
                    {
                        ClientSession session = _sessions[i];
                        if (!session.IsReady) continue;
                        clients.Add(new ClientInfo
                        {
                            Name = session.ClientName,
                            Version = session.ClientVersion,
                            Pid = session.ClientPid,
                            SessionId = session.SessionId,
                        });
                    }
                    return clients.ToArray();
                }
            }
        }

        /// <summary>Main thread only (SessionState). Binds, stores the port, starts accepting.</summary>
        public static TcpHost Start()
        {
            TcpHost host = new TcpHost();
            host.StartCore();
            Current = host;
            return host;
        }

        private void StartCore()
        {
            int preferred = Protocol.PreferredPort(McpEditorInfo.ProjectPath);
            int stored = ParsePort(SessionState.GetString(PortKey, ""));

            List<int> candidates = new List<int>();
            if (stored > 0) candidates.Add(stored);          // same port across domain reload
            candidates.Add(preferred);
            for (int i = 1; i <= Protocol.PortProbeSteps; i++) candidates.Add(preferred + i);
            candidates.Add(0);                               // OS-assigned last resort

            SocketException lastError = null;
            for (int i = 0; i < candidates.Count; i++)
            {
                TcpListener listener = new TcpListener(IPAddress.Loopback, candidates[i]);
                try
                {
                    listener.Start(16);
                    _listener = listener;
                    break;
                }
                catch (SocketException ex)
                {
                    lastError = ex;
                }
            }

            if (_listener == null)
            {
                throw new InvalidOperationException(
                    "could not bind any candidate port", lastError);
            }

            Port = ((IPEndPoint)_listener.LocalEndpoint).Port;
            SessionState.SetString(PortKey, Port.ToString());

            // Same-user auth token: random per editor session, persisted across
            // domain reloads (like the port) so reconnecting clients keep their
            // cached credentials. Published only via the user-ACL'd registry file.
            string token = SessionState.GetString(TokenKey, "");
            if (string.IsNullOrEmpty(token) || token.Length != 32)
            {
                token = GenerateToken();
                SessionState.SetString(TokenKey, token);
            }
            Token = token;

            _acceptThread = new Thread(AcceptLoop)
            {
                IsBackground = true,
                Name = "UnityMCP-Accept",
            };
            _acceptThread.Start();
        }

        private static int ParsePort(string s)
        {
            int p;
            return int.TryParse(s, out p) && p > 0 && p <= 65535 ? p : -1;
        }

        private static string GenerateToken()
        {
            byte[] bytes = new byte[16];
            using (System.Security.Cryptography.RandomNumberGenerator rng =
                   System.Security.Cryptography.RandomNumberGenerator.Create())
            {
                rng.GetBytes(bytes);
            }
            System.Text.StringBuilder sb = new System.Text.StringBuilder(32);
            for (int i = 0; i < bytes.Length; i++) sb.Append(bytes[i].ToString("x2"));
            return sb.ToString();
        }

        private void AcceptLoop()
        {
            while (!_stopped)
            {
                TcpClient client = null;
                try
                {
                    client = _listener.AcceptTcpClient();
                }
                catch (SocketException)
                {
                    if (_stopped) break;
                    continue;
                }
                catch (ObjectDisposedException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Debug.LogError("[UnityMCP] accept loop failed: " + ex);
                    break;
                }

                if (_stopped)
                {
                    try { client.Close(); } catch { }
                    break;
                }

                // L-15 (audit): no cap let a local pre-auth attacker exhaust
                // threads/handles with mass connects. 16 covers every real
                // multi-client scenario (live-tested 3) with headroom.
                int liveCount;
                lock (_sessionsGate) liveCount = _sessions.Count;
                if (liveCount >= 16)
                {
                    Debug.LogWarning("[UnityMCP] connection cap (16) reached - rejecting new connection");
                    try { client.Close(); } catch { }
                    continue;
                }

                try
                {
                    client.NoDelay = true;
                    ClientSession session = new ClientSession(client, this);
                    lock (_sessionsGate) _sessions.Add(session);
                    session.Start();
                }
                catch (Exception ex)
                {
                    Debug.LogError("[UnityMCP] session start failed: " + ex);
                    try { client.Close(); } catch { }
                }
            }
        }

        internal void OnSessionClosed(ClientSession session)
        {
            lock (_sessionsGate) _sessions.Remove(session);
        }

        /// <summary>Send to every handshaked client. Safe from any thread.</summary>
        public void Broadcast(Envelope env)
        {
            ClientSession[] snapshot;
            lock (_sessionsGate) snapshot = _sessions.ToArray();
            for (int i = 0; i < snapshot.Length; i++)
            {
                if (snapshot[i].IsReady) snapshot[i].Send(env);
            }
        }

        /// <summary>True when the logical session id has a live handshaked connection. Safe from any thread.</summary>
        public bool HasLiveSession(string sessionId)
        {
            if (string.IsNullOrEmpty(sessionId)) return false;
            ClientSession[] snapshot;
            lock (_sessionsGate) snapshot = _sessions.ToArray();
            for (int i = 0; i < snapshot.Length; i++)
            {
                if (snapshot[i].IsReady &&
                    string.Equals(snapshot[i].SessionId, sessionId, StringComparison.Ordinal))
                {
                    return true;
                }
            }
            return false;
        }

        /// <summary>Send to every connection of one logical session id. Safe from any thread.</summary>
        public void SendToSession(string sessionId, Envelope env)
        {
            if (string.IsNullOrEmpty(sessionId)) return;
            ClientSession[] snapshot;
            lock (_sessionsGate) snapshot = _sessions.ToArray();
            for (int i = 0; i < snapshot.Length; i++)
            {
                if (snapshot[i].IsReady &&
                    string.Equals(snapshot[i].SessionId, sessionId, StringComparison.Ordinal))
                {
                    snapshot[i].Send(env);
                }
            }
        }

        /// <summary>HTTP health body. No Unity API: cached info + pump snapshot only (transport thread).</summary>
        public string BuildHealthJson()
        {
            // L-14 (audit): this endpoint is unauthenticated (that is its
            // point - a liveness probe) and reachable by any local process or
            // a DNS-rebound web page. projectPath embedded the OS user name;
            // projectName is enough to tell editors apart. Everything that
            // needs the full path authenticates over the framed protocol.
            MainThreadPump.Snapshot snap = MainThreadPump.Current;
            return Protocol.Serialize(new
            {
                status = "ok",
                projectName = McpEditorInfo.ProjectName,
                unityVersion = McpEditorInfo.UnityVersion,
                pluginVersion = McpEditorInfo.PluginVersion,
                protocolV = Protocol.Version,
                compiling = snap != null && snap.Compiling,
                clients = ClientCount,
                jobs = JobManager.RunningCount,
                evalEngine = EvalService.EngineName,
            });
        }

        /// <summary>
        /// Ritual steps 3..5: broadcast bye, flush send queues within a shared
        /// budget, close sockets, stop the listener. Bounded (~budget ms), so
        /// it is legal on the main thread during beforeAssemblyReload/quit.
        /// </summary>
        public void StopWithBye(string reason, int? resumeHintMs, int flushBudgetMs)
        {
            if (_stopped)
            {
                if (ReferenceEquals(Current, this)) Current = null;
                return;
            }
            _stopped = true; // accept loop drops any client that races in from here on

            ClientSession[] snapshot;
            lock (_sessionsGate) snapshot = _sessions.ToArray();

            Envelope bye = Frames.Bye(reason, resumeHintMs);
            for (int i = 0; i < snapshot.Length; i++)
            {
                if (snapshot[i].IsReady) snapshot[i].Send(bye);
            }

            Stopwatch sw = Stopwatch.StartNew();
            for (int i = 0; i < snapshot.Length; i++)
            {
                long remaining = flushBudgetMs - sw.ElapsedMilliseconds;
                if (remaining < 0) remaining = 0;
                snapshot[i].CloseAfterFlush(reason, (int)remaining);
            }

            try { _listener.Stop(); } catch { }

            // Sweep sessions that connected between the snapshot and listener stop.
            ClientSession[] leftovers;
            lock (_sessionsGate) leftovers = _sessions.ToArray();
            for (int i = 0; i < leftovers.Length; i++)
            {
                leftovers[i].Close(reason);
            }
            if (ReferenceEquals(Current, this)) Current = null;
        }
    }
}
