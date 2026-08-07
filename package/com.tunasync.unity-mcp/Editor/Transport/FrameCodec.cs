// Wire framing per docs/PROTOCOL.md:
//   uint32 big-endian payload length, then that many bytes of UTF-8 JSON.
//   Max frame 64 MiB. If the first 4 bytes of a connection spell an HTTP verb
//   (GET /HEAD/POST/OPTI) the plugin answers a one-shot HTTP health response.
// Also hosts the envelope factory (Frames). Nothing in this file may touch the
// Unity API: everything runs on transport threads.
using System;
using System.IO;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace TunaSync.UnityMCP.Editor
{
    internal static class FrameCodec
    {
        /// <summary>Read exactly count bytes. Returns false on EOF (clean or mid-frame).</summary>
        public static bool TryReadExactly(Stream stream, byte[] buffer, int offset, int count)
        {
            int read = 0;
            while (read < count)
            {
                int n = stream.Read(buffer, offset + read, count - read);
                if (n <= 0) return false;
                read += n;
            }
            return true;
        }

        /// <summary>True when the 4 peeked bytes start an HTTP request (GET /HEAD/POST/OPTI).</summary>
        public static bool IsHttpPreamble(byte[] h4)
        {
            if (h4 == null || h4.Length < 4) return false;
            return Matches(h4, "GET ") || Matches(h4, "HEAD") || Matches(h4, "POST") || Matches(h4, "OPTI");
        }

        private static bool Matches(byte[] h4, string ascii)
        {
            for (int i = 0; i < 4; i++)
            {
                if (h4[i] != (byte)ascii[i]) return false;
            }
            return true;
        }

        /// <summary>Decode the big-endian length prefix. Throws InvalidDataException above MaxFrameBytes.</summary>
        public static int ParseLength(byte[] h4)
        {
            uint len = ((uint)h4[0] << 24) | ((uint)h4[1] << 16) | ((uint)h4[2] << 8) | h4[3];
            if (len > (uint)Protocol.MaxFrameBytes)
            {
                throw new InvalidDataException("frame length " + len + " exceeds " + Protocol.MaxFrameBytes);
            }
            return (int)len;
        }

        /// <summary>Read the payload that follows an already-read 4-byte header. Null on EOF.</summary>
        public static byte[] ReadPayload(Stream stream, byte[] h4)
        {
            int len = ParseLength(h4);
            byte[] payload = new byte[len];
            if (len == 0) return payload;
            return TryReadExactly(stream, payload, 0, len) ? payload : null;
        }

        /// <summary>Serialize an envelope via Protocol.JsonSettings and prepend the BE length prefix.</summary>
        public static byte[] EncodeFrame(Envelope env)
        {
            string json = Protocol.Serialize(env);
            byte[] body = Encoding.UTF8.GetBytes(json);
            if (body.Length > Protocol.MaxFrameBytes)
            {
                throw new InvalidDataException("outbound frame exceeds " + Protocol.MaxFrameBytes + " bytes");
            }
            byte[] frame = new byte[4 + body.Length];
            uint len = (uint)body.Length;
            frame[0] = (byte)(len >> 24);
            frame[1] = (byte)(len >> 16);
            frame[2] = (byte)(len >> 8);
            frame[3] = (byte)len;
            Buffer.BlockCopy(body, 0, frame, 4, body.Length);
            return frame;
        }

        /// <summary>One-shot HTTP 200 response bytes for the health endpoint.</summary>
        public static byte[] EncodeHttpResponse(string jsonBody)
        {
            byte[] body = Encoding.UTF8.GetBytes(jsonBody ?? "{}");
            string head =
                "HTTP/1.1 200 OK\r\n" +
                "Content-Type: application/json\r\n" +
                "Content-Length: " + body.Length + "\r\n" +
                "Connection: close\r\n" +
                "\r\n";
            byte[] headBytes = Encoding.ASCII.GetBytes(head);
            byte[] resp = new byte[headBytes.Length + body.Length];
            Buffer.BlockCopy(headBytes, 0, resp, 0, headBytes.Length);
            Buffer.BlockCopy(body, 0, resp, headBytes.Length, body.Length);
            return resp;
        }
    }

    /// <summary>
    /// Envelope factory. res/progress reuse the id of the req they answer;
    /// every other frame gets a fresh uuid (PROTOCOL.md "Envelope").
    /// Safe from any thread.
    /// </summary>
    internal static class Frames
    {
        // JsonSerializer is thread-safe as long as its settings are not mutated.
        private static readonly JsonSerializer Serializer = JsonSerializer.Create(Protocol.JsonSettings);

        public static string NewId() => Guid.NewGuid().ToString();

        public static JToken Token(object o)
        {
            if (o == null) return JValue.CreateNull();
            JToken jt = o as JToken;
            return jt ?? JToken.FromObject(o, Serializer);
        }

        public static JObject Obj(object o)
        {
            JObject jo = o as JObject;
            if (jo != null) return jo;
            return o == null ? new JObject() : JObject.FromObject(o, Serializer);
        }

        public static Envelope Res(string id, object result)
        {
            JObject payload = new JObject();
            payload["ok"] = true;
            payload["result"] = Token(result);
            return new Envelope { Id = id, Type = FrameType.Res, Payload = payload };
        }

        public static Envelope ResError(string id, ErrorObj error)
        {
            JObject payload = new JObject();
            payload["ok"] = false;
            payload["error"] = Token(error);
            return new Envelope { Id = id, Type = FrameType.Res, Payload = payload };
        }

        public static Envelope Pong(string pingId)
        {
            return new Envelope { Id = pingId, Type = FrameType.Pong, Payload = new JObject() };
        }

        public static Envelope Event(string kind, object data)
        {
            JObject payload = new JObject();
            payload["kind"] = kind;
            payload["data"] = Token(data);
            return new Envelope { Id = NewId(), Type = FrameType.Event, Payload = payload };
        }

        public static Envelope Progress(string reqId, double? pct, string message, string phase, int seq)
        {
            JObject payload = new JObject();
            if (pct.HasValue) payload["pct"] = pct.Value;
            if (message != null) payload["message"] = message;
            if (phase != null) payload["phase"] = phase;
            payload["seq"] = seq;
            return new Envelope { Id = reqId, Type = FrameType.Progress, Payload = payload };
        }

        public static Envelope Bye(string reason, int? resumeHintMs)
        {
            JObject payload = new JObject();
            payload["reason"] = reason;
            if (resumeHintMs.HasValue) payload["resumeHintMs"] = resumeHintMs.Value;
            return new Envelope { Id = NewId(), Type = FrameType.Bye, Payload = payload };
        }

        public static Envelope Welcome(JObject payload)
        {
            return new Envelope { V = Protocol.Version, Id = NewId(), Type = FrameType.Welcome, Payload = payload };
        }
    }
}
