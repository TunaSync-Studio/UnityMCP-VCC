// One accepted TCP client.
// Read thread: HTTP peek -> hello gate (5 s) -> version negotiation -> frame
// routing (ping answered inline; req/cancel go to Dispatcher). Write thread:
// drains a queue of envelopes. Both are background threads and never touch
// the Unity API (Debug.Log* is documented thread-safe and is the only
// exception). All sends from any thread enqueue; only the writer touches the
// socket for framed traffic.
using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Debug = UnityEngine.Debug;

namespace TunaSync.UnityMCP.Editor
{
    internal sealed class ClientSession
    {
        private readonly TcpClient _client;
        private readonly TcpHost _host;
        private readonly BlockingCollection<Envelope> _sendQueue = new BlockingCollection<Envelope>();

        private NetworkStream _stream;
        private Thread _readThread;
        private Thread _writeThread;
        private int _closed;                 // 0/1 via Interlocked
        private volatile bool _ready;        // handshake complete
        private volatile bool _helloDone;
        private int _inFlight;

        /// <summary>Unique per TCP connection (in-flight keying).</summary>
        public readonly string InstanceId = Guid.NewGuid().ToString("N");

        /// <summary>Logical session id from hello.client.sessionId (lease identity).</summary>
        public string SessionId { get; private set; }

        public string ClientName { get; private set; }
        public string ClientVersion { get; private set; }
        public int? ClientPid { get; private set; }

        public ClientSession(TcpClient client, TcpHost host)
        {
            _client = client;
            _host = host;
            SessionId = "pre-hello-" + InstanceId;
            ClientName = "unknown";
            ClientVersion = "unknown";
        }

        public bool IsReady => _ready;
        public bool IsClosed => Volatile.Read(ref _closed) != 0;
        public int InFlightCount => Volatile.Read(ref _inFlight);

        public void IncrementInFlight() => Interlocked.Increment(ref _inFlight);
        public void DecrementInFlight() => Interlocked.Decrement(ref _inFlight);

        public void Start()
        {
            _readThread = new Thread(ReadLoop)
            {
                IsBackground = true,
                Name = "UnityMCP-Read",
            };
            _readThread.Start();
        }

        /// <summary>Enqueue a frame for this client. Safe from any thread; drops silently when closed.</summary>
        public void Send(Envelope env)
        {
            if (env == null || IsClosed) return;
            try
            {
                _sendQueue.Add(env);
            }
            catch (InvalidOperationException)
            {
                // CompleteAdding raced; frame is dropped with the connection.
            }
        }

        /// <summary>Close immediately without draining the send queue. Idempotent.</summary>
        public void Close(string reason) => CloseCore(reason, 0);

        /// <summary>Close after giving the writer up to flushBudgetMs to drain (bye paths). Idempotent.</summary>
        public void CloseAfterFlush(string reason, int flushBudgetMs) => CloseCore(reason, flushBudgetMs);

        private void CloseCore(string reason, int flushBudgetMs)
        {
            if (Interlocked.Exchange(ref _closed, 1) != 0) return;
            bool wasReady = _ready;
            _ready = false;

            try { _sendQueue.CompleteAdding(); } catch { }

            Thread writer = _writeThread;
            if (flushBudgetMs > 0 && writer != null && writer.IsAlive &&
                !ReferenceEquals(writer, Thread.CurrentThread))
            {
                try { writer.Join(flushBudgetMs); } catch { }
            }

            try { _client.Close(); } catch { }

            Dispatcher.OnSessionClosed(this);
            _host.OnSessionClosed(this);

            if (wasReady)
            {
                Debug.Log("[UnityMCP] client disconnected: " + ClientName +
                          " (" + SessionId + "), reason=" + reason);
            }
        }

        // ---- read side ------------------------------------------------------

        private void ReadLoop()
        {
            string closeReason = "eof";
            try
            {
                _stream = _client.GetStream();
                _stream.ReadTimeout = Protocol.HelloTimeoutMs; // hello window

                byte[] header = new byte[4];
                if (!FrameCodec.TryReadExactly(_stream, header, 0, 4)) return;

                if (FrameCodec.IsHttpPreamble(header))
                {
                    // One-shot HTTP health response, then close (PROTOCOL.md "Framing").
                    byte[] resp = FrameCodec.EncodeHttpResponse(_host.BuildHealthJson());
                    _stream.Write(resp, 0, resp.Length);
                    _stream.Flush();
                    // F-20: closing with unread request bytes in the receive
                    // buffer makes Windows RST the connection, which strict
                    // clients (node/fetch) report as ECONNRESET before they
                    // parse the 200 (11/14 repro on a process's first
                    // request). Send FIN first, then drain the remainder of
                    // the request until the peer closes, so the response is
                    // delivered with a graceful close.
                    try { _client.Client.Shutdown(SocketShutdown.Send); } catch { }
                    try
                    {
                        _stream.ReadTimeout = 1000;
                        byte[] drain = new byte[1024];
                        int drained = 0;
                        while (drained < 64 * 1024)
                        {
                            int n = _stream.Read(drain, 0, drain.Length);
                            if (n <= 0) break; // peer closed
                            drained += n;
                        }
                    }
                    catch { /* timeout or reset while draining - nothing to save */ }
                    closeReason = "http";
                    return;
                }

                // Framed mode confirmed: start the writer.
                _writeThread = new Thread(WriteLoop)
                {
                    IsBackground = true,
                    Name = "UnityMCP-Write",
                };
                _writeThread.Start();

                byte[] payload = FrameCodec.ReadPayload(_stream, header);
                if (payload == null) return;

                Envelope first = ParseEnvelope(payload);
                if (first == null || first.Type != FrameType.Hello)
                {
                    Send(Frames.ResError(
                        first != null && !string.IsNullOrEmpty(first.Id) ? first.Id : Frames.NewId(),
                        ErrorObj.Make(ErrorCodes.ProtocolError, "first frame must be hello")));
                    CloseAfterFlush("no_hello", 250);
                    return;
                }

                if (!HandleHello(first))
                {
                    CloseAfterFlush("handshake_rejected", 250);
                    return;
                }

                _stream.ReadTimeout = Timeout.Infinite;

                while (!IsClosed)
                {
                    if (!FrameCodec.TryReadExactly(_stream, header, 0, 4)) break;
                    payload = FrameCodec.ReadPayload(_stream, header);
                    if (payload == null) break;

                    Envelope env = ParseEnvelope(payload);
                    if (env == null)
                    {
                        Send(Frames.ResError(Frames.NewId(),
                            ErrorObj.Make(ErrorCodes.ParseError, "unparseable frame payload")));
                        continue;
                    }
                    Route(env);
                }
            }
            catch (InvalidDataException ex)
            {
                // Oversized frame: framing is unrecoverable. Courtesy error, then close.
                closeReason = "frame_too_large";
                try
                {
                    Send(Frames.ResError(Frames.NewId(),
                        ErrorObj.Make(ErrorCodes.ProtocolError, ex.Message)));
                }
                catch { }
                CloseAfterFlush(closeReason, 100);
            }
            catch (IOException)
            {
                if (!_helloDone && !IsClosed)
                {
                    // Read timeout inside the hello window (or early disconnect).
                    closeReason = "hello_timeout";
                    Envelope err = Frames.ResError(Frames.NewId(),
                        ErrorObj.Make(ErrorCodes.HelloTimeout,
                            "hello not received within " + Protocol.HelloTimeoutMs + " ms"));
                    if (_writeThread == null)
                    {
                        // Writer never started (client sent nothing): write directly,
                        // there is no concurrent writer on this socket.
                        try
                        {
                            byte[] frame = FrameCodec.EncodeFrame(err);
                            _stream.Write(frame, 0, frame.Length);
                        }
                        catch { }
                    }
                    else
                    {
                        Send(err);
                        CloseAfterFlush(closeReason, 100);
                    }
                }
                else
                {
                    closeReason = "io";
                }
            }
            catch (ObjectDisposedException)
            {
                closeReason = "closed";
            }
            catch (SocketException)
            {
                closeReason = "socket";
            }
            catch (Exception ex)
            {
                closeReason = "read_error";
                Debug.LogError("[UnityMCP] read loop failed: " + ex);
            }
            finally
            {
                Close(closeReason);
            }
        }

        private static Envelope ParseEnvelope(byte[] payload)
        {
            try
            {
                string json = Encoding.UTF8.GetString(payload);
                return JsonConvert.DeserializeObject<Envelope>(json, Protocol.JsonSettings);
            }
            catch
            {
                return null;
            }
        }

        private bool HandleHello(Envelope hello)
        {
            JObject p = hello.Payload ?? new JObject();

            int clientMin = ReadInt(p, "v", "min", 1);
            int clientMax = ReadInt(p, "v", "max", 1);
            int pick = Math.Min(clientMax, Protocol.Version);
            if (pick < clientMin || pick < Protocol.Version)
            {
                // Plugin speaks exactly v1 for now; anything else is unsupported.
                Send(Frames.ResError(
                    string.IsNullOrEmpty(hello.Id) ? Frames.NewId() : hello.Id,
                    ErrorObj.Make(ErrorCodes.VersionUnsupported,
                        "plugin supports protocol v" + Protocol.Version +
                        ", client offered " + clientMin + ".." + clientMax)));
                return false;
            }

            JObject client = p["client"] as JObject;

            // Same-user auth (v2.1): the token is published only through the
            // user-ACL'd registry file, so knowing it proves same-Windows-user.
            // Additive hello field; PROTOCOL_V stays 1.
            string expectedToken = _host.Token;
            if (!string.IsNullOrEmpty(expectedToken))
            {
                string clientToken = client != null && client["token"] != null &&
                                     client["token"].Type != JTokenType.Null
                    ? client["token"].Value<string>()
                    : null;
                if (!FixedTimeEquals(clientToken, expectedToken))
                {
                    Send(Frames.ResError(
                        string.IsNullOrEmpty(hello.Id) ? Frames.NewId() : hello.Id,
                        ErrorObj.Make(ErrorCodes.AuthRequired,
                            "connect via the registry file token")));
                    return false;
                }
            }

            string sid = client != null && client["sessionId"] != null
                ? client["sessionId"].Value<string>()
                : null;
            SessionId = string.IsNullOrEmpty(sid) ? "anon-" + InstanceId : sid;
            string name = client != null && client["name"] != null
                ? client["name"].Value<string>()
                : null;
            ClientName = string.IsNullOrEmpty(name) ? "unknown" : name;
            string version = client != null && client["version"] != null &&
                             client["version"].Type != JTokenType.Null
                ? client["version"].Value<string>()
                : null;
            ClientVersion = string.IsNullOrEmpty(version) ? "unknown" : version;
            try
            {
                JToken pid = client != null ? client["pid"] : null;
                ClientPid = pid != null && pid.Type != JTokenType.Null ? pid.Value<int?>() : null;
            }
            catch { ClientPid = null; }

            _helloDone = true;
            Send(Frames.Welcome(SysHandlers.BuildWelcomePayload(pick)));
            _ready = true;
            Debug.Log("[UnityMCP] client connected: " + ClientName + " (" + SessionId + ")");
            return true;
        }

        /// <summary>Constant-time comparison (avoids trivial token timing probes).</summary>
        private static bool FixedTimeEquals(string a, string b)
        {
            if (a == null || b == null) return false;
            int diff = a.Length ^ b.Length;
            int max = a.Length < b.Length ? a.Length : b.Length;
            for (int i = 0; i < max; i++) diff |= a[i] ^ b[i];
            return diff == 0;
        }

        private static int ReadInt(JObject obj, string outer, string inner, int fallback)
        {
            try
            {
                JToken o = obj[outer];
                if (o == null) return fallback;
                JToken v = o[inner];
                if (v == null || v.Type == JTokenType.Null) return fallback;
                return v.Value<int>();
            }
            catch
            {
                return fallback;
            }
        }

        private void Route(Envelope env)
        {
            // Any frame from the lease holder refreshes the lease TTL.
            LeaseManager.OnActivity(SessionId);

            switch (env.Type)
            {
                case FrameType.Ping:
                    // Answered right here on the transport thread: works during compile/modal.
                    Send(Frames.Pong(env.Id));
                    break;

                case FrameType.Req:
                    Dispatcher.Dispatch(env, this);
                    break;

                case FrameType.Cancel:
                {
                    string targetId = env.Payload != null && env.Payload["targetId"] != null
                        ? env.Payload["targetId"].Value<string>()
                        : null;
                    // Ack first, then cancel: the target's CANCELLED res must not
                    // overtake the ack (Dispatcher.Cancel runs callbacks inline).
                    bool found = Dispatcher.IsInFlight(this, targetId);
                    Send(Frames.Res(
                        string.IsNullOrEmpty(env.Id) ? Frames.NewId() : env.Id,
                        new { found }));
                    if (found) Dispatcher.Cancel(this, targetId);
                    break;
                }

                case FrameType.Hello:
                    Send(Frames.ResError(
                        string.IsNullOrEmpty(env.Id) ? Frames.NewId() : env.Id,
                        ErrorObj.Make(ErrorCodes.ProtocolError, "duplicate hello")));
                    break;

                default:
                    Send(Frames.ResError(
                        string.IsNullOrEmpty(env.Id) ? Frames.NewId() : env.Id,
                        ErrorObj.Make(ErrorCodes.ProtocolError,
                            "unexpected frame type '" + (env.Type ?? "null") + "'")));
                    break;
            }
        }

        // ---- write side -----------------------------------------------------

        private void WriteLoop()
        {
            try
            {
                foreach (Envelope env in _sendQueue.GetConsumingEnumerable())
                {
                    byte[] frame = FrameCodec.EncodeFrame(env);
                    _stream.Write(frame, 0, frame.Length);
                }
            }
            catch (IOException) { }
            catch (ObjectDisposedException) { }
            catch (InvalidOperationException) { }
            catch (Exception ex)
            {
                Debug.LogError("[UnityMCP] write loop failed: " + ex);
            }
            finally
            {
                Close("write_end");
            }
        }
    }
}
