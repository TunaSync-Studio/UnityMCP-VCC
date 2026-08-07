// Console log capture.
// Application.logMessageReceivedThreaded fires on ANY thread, so the callback
// only does string work and queueing (no Unity API). Entries land in a ring
// buffer (2000) and are broadcast to connected clients as {kind:"log"} event
// frames from the pump tick, throttled to 50 frames per tick. Per-request
// scopes let eval (P2) collect the logs emitted while it ran.
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Threading;
using UnityEngine;

namespace TunaSync.UnityMCP.Editor
{
    public static class LogCapture
    {
        public sealed class Entry
        {
            public string Level;
            public string Message;
            public string FirstStackLine;
            public long Id;
            public string Ts;
        }

        public const int RingCapacity = 2000;
        public const int MaxBroadcastPerTick = 50;
        private const int PendingCap = 2000;
        private const int ScopeCap = 500;

        private static readonly object _ringGate = new object();
        private static readonly Queue<Entry> _ring = new Queue<Entry>(RingCapacity);

        private static readonly ConcurrentQueue<Entry> _pending = new ConcurrentQueue<Entry>();
        private static int _pendingCount;

        private static readonly object _scopeGate = new object();
        private static readonly List<LogScope> _scopes = new List<LogScope>();

        private static long _nextId;
        private static bool _initialized;

        /// <summary>Main thread only. Called once from Bootstrap.</summary>
        public static void Init()
        {
            if (_initialized) return;
            _initialized = true;
            Application.logMessageReceivedThreaded += OnLogThreaded;
            MainThreadPump.AddTicker(Tick);
        }

        /// <summary>Most recent entries, oldest first. Safe from any thread.</summary>
        public static Entry[] Snapshot(int max)
        {
            lock (_ringGate)
            {
                int count = _ring.Count;
                int take = max > 0 && max < count ? max : count;
                Entry[] all = _ring.ToArray();
                if (take == count) return all;
                Entry[] result = new Entry[take];
                Array.Copy(all, count - take, result, 0, take);
                return result;
            }
        }

        /// <summary>Clear the ring and any pending broadcasts (logs.clear). Safe from any thread.</summary>
        public static void Clear()
        {
            lock (_ringGate) _ring.Clear();
            Entry drained;
            while (_pending.TryDequeue(out drained))
            {
                Interlocked.Decrement(ref _pendingCount);
            }
        }

        /// <summary>Start collecting logs for one request (eval). Dispose to stop. Any thread.</summary>
        public static LogScope BeginScope()
        {
            LogScope scope = new LogScope();
            lock (_scopeGate) _scopes.Add(scope);
            return scope;
        }

        internal static void EndScope(LogScope scope)
        {
            lock (_scopeGate) _scopes.Remove(scope);
        }

        // Runs on ANY thread. Unity API is off-limits here; string work only.
        private static void OnLogThreaded(string condition, string stackTrace, LogType type)
        {
            try
            {
                Entry e = new Entry
                {
                    Level = MapLevel(type),
                    Message = condition,
                    FirstStackLine = FirstLine(stackTrace),
                    Id = Interlocked.Increment(ref _nextId),
                    Ts = DateTime.UtcNow.ToString("o"),
                };

                lock (_ringGate)
                {
                    _ring.Enqueue(e);
                    while (_ring.Count > RingCapacity) _ring.Dequeue();
                }

                lock (_scopeGate)
                {
                    for (int i = 0; i < _scopes.Count; i++) _scopes[i].Append(e);
                }

                if (Interlocked.Increment(ref _pendingCount) <= PendingCap)
                {
                    _pending.Enqueue(e);
                }
                else
                {
                    Interlocked.Decrement(ref _pendingCount); // backlog full: drop broadcast, ring keeps it
                }
            }
            catch
            {
                // Never throw out of the log callback (and never log from it).
            }
        }

        // Pump tick, main thread: broadcast at most 50 pending entries.
        private static void Tick()
        {
            TcpHost host = TcpHost.Current;
            int n = 0;
            Entry e;
            while (n < MaxBroadcastPerTick && _pending.TryDequeue(out e))
            {
                Interlocked.Decrement(ref _pendingCount);
                n++;
                if (host != null && host.ClientCount > 0)
                {
                    host.Broadcast(Frames.Event(EventKind.Log, e));
                }
            }
        }

        private static string MapLevel(LogType type)
        {
            switch (type)
            {
                case LogType.Warning: return "warning";
                case LogType.Error: return "error";
                case LogType.Assert: return "assert";
                case LogType.Exception: return "exception";
                default: return "info";
            }
        }

        private static string FirstLine(string text)
        {
            if (string.IsNullOrEmpty(text)) return null;
            int nl = text.IndexOf('\n');
            string line = nl >= 0 ? text.Substring(0, nl) : text;
            line = line.Trim();
            return line.Length > 0 ? line : null;
        }

        /// <summary>Collects log entries emitted while the scope is open. Thread-safe.</summary>
        public sealed class LogScope : IDisposable
        {
            private readonly object _gate = new object();
            private readonly List<Entry> _entries = new List<Entry>();
            private bool _disposed;

            internal void Append(Entry e)
            {
                lock (_gate)
                {
                    if (_entries.Count < ScopeCap) _entries.Add(e);
                }
            }

            /// <summary>All collected entries so far, oldest first.</summary>
            public Entry[] Drain()
            {
                lock (_gate) return _entries.ToArray();
            }

            /// <summary>Messages of collected error/assert/exception entries (ErrorObj.consoleErrors).</summary>
            public string[] ErrorMessages()
            {
                lock (_gate)
                {
                    List<string> result = new List<string>();
                    for (int i = 0; i < _entries.Count; i++)
                    {
                        string lv = _entries[i].Level;
                        if (lv == "error" || lv == "assert" || lv == "exception")
                        {
                            result.Add(_entries[i].Message);
                        }
                    }
                    return result.ToArray();
                }
            }

            public void Dispose()
            {
                if (_disposed) return;
                _disposed = true;
                EndScope(this);
            }
        }
    }
}
