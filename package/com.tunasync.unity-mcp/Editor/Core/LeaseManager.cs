// Write lease (single-writer coordination between MCP server sessions).
// - Auto-acquired by the first mutating call of a session (EnsureHeldForWrite).
// - TTL 120 s, refreshed by ANY frame from the holder (OnActivity is called
//   from transport threads and therefore never touches SessionState).
// - Takeover notifies the old holder with a lease.lost event and resolves its
//   in-flight mutating reqs with LEASE_LOST.
// - Holder id is persisted to SessionState (survives domain reload; TTL
//   restarts fresh after reload). Reads never need the lease.
using System;
using UnityEditor;

namespace TunaSync.UnityMCP.Editor
{
    public static class LeaseManager
    {
        public const int TtlMs = 120000;
        public const long MinTtlMs = 5000;
        public const long MaxTtlMs = 3600000;
        private const string HolderKey = "TunaSync.UnityMCP.Lease.v1";

        private static readonly object _gate = new object();
        private static string _holder;
        private static long _expiresUtcTicks;
        // TTL of the CURRENT holder (per-acquire override, default TtlMs).
        // OnActivity refreshes with this value so a custom TTL sticks.
        private static long _holderTtlTicks = TtlTicks;
        private static bool _initialized;

        /// <summary>Main thread only. Restores the persisted holder with a fresh TTL.</summary>
        public static void Init()
        {
            if (_initialized) return;
            _initialized = true;
            string holder = SessionState.GetString(HolderKey, "");
            if (!string.IsNullOrEmpty(holder))
            {
                lock (_gate)
                {
                    _holder = holder;
                    _holderTtlTicks = TtlTicks; // custom TTLs do not survive reload
                    _expiresUtcTicks = DateTime.UtcNow.Ticks + TtlTicks;
                }
            }
        }

        private static long TtlTicks => (long)TtlMs * TimeSpan.TicksPerMillisecond;

        private static long ClampTtlTicks(long ttlMs)
        {
            if (ttlMs <= 0) return TtlTicks;
            long clamped = ttlMs < MinTtlMs ? MinTtlMs : (ttlMs > MaxTtlMs ? MaxTtlMs : ttlMs);
            return clamped * TimeSpan.TicksPerMillisecond;
        }

        /// <summary>Effective TTL (ms) of the current holder. Safe from any thread.</summary>
        public static long CurrentTtlMs()
        {
            lock (_gate) return _holderTtlTicks / TimeSpan.TicksPerMillisecond;
        }

        /// <summary>Auto-acquire for a mutating call. Main thread only (persists on change).</summary>
        public static bool EnsureHeldForWrite(string sessionId) => TryAcquire(sessionId);

        /// <summary>
        /// Acquire or refresh. ttlMs<=0 = default 120 s on a NEW acquisition;
        /// for the existing holder it keeps the current TTL (F-6: the write
        /// path auto-refreshes through here, and rolling a 900 s lease back to
        /// 120 s opened a takeover window exactly during long jobs). An
        /// explicit positive ttlMs always applies. Main thread only (persists
        /// on change).
        /// </summary>
        public static bool TryAcquire(string sessionId, long ttlMs = 0)
        {
            if (string.IsNullOrEmpty(sessionId)) return false;
            bool acquired;
            bool changed = false;
            // A holder with no live connection cannot be mid-write; let a new
            // session steal instead of blocking for the TTL window (reload with a
            // changed sessionId, crashed client, etc.). Checked outside _gate:
            // TcpHost takes its own lock and never calls back into ours.
            string holderNow;
            lock (_gate) holderNow = _holder;
            bool holderDisconnected = holderNow != null && holderNow != sessionId
                && TcpHost.Current != null
                && !TcpHost.Current.HasLiveSession(holderNow);
            long requestedTtlTicks = ClampTtlTicks(ttlMs);
            lock (_gate)
            {
                long now = DateTime.UtcNow.Ticks;
                bool free = _holder == null || now >= _expiresUtcTicks
                    || (holderDisconnected && _holder == holderNow);
                if (free || _holder == sessionId)
                {
                    changed = _holder != sessionId;
                    // F-6: implicit refresh (no explicit ttl) by the same
                    // holder must not overwrite a custom TTL with the default.
                    long ttlTicks = (ttlMs <= 0 && !changed) ? _holderTtlTicks : requestedTtlTicks;
                    _holder = sessionId;
                    _holderTtlTicks = ttlTicks;
                    _expiresUtcTicks = now + ttlTicks;
                    acquired = true;
                }
                else
                {
                    acquired = false;
                }
            }
            if (changed) PersistNow();
            return acquired;
        }

        /// <summary>TTL refresh on any frame from the holder. Safe from transport threads (no SessionState).</summary>
        public static void OnActivity(string sessionId)
        {
            if (string.IsNullOrEmpty(sessionId)) return;
            lock (_gate)
            {
                long now = DateTime.UtcNow.Ticks;
                if (_holder == sessionId && now < _expiresUtcTicks)
                {
                    _expiresUtcTicks = now + _holderTtlTicks;
                }
            }
        }

        /// <summary>Release if held by this session. Main thread only.</summary>
        public static bool Release(string sessionId)
        {
            if (string.IsNullOrEmpty(sessionId)) return false;
            bool released = false;
            lock (_gate)
            {
                if (_holder == sessionId)
                {
                    _holder = null;
                    _expiresUtcTicks = 0;
                    released = true;
                }
            }
            if (released) PersistNow();
            return released;
        }

        /// <summary>
        /// Forced takeover. Main thread only. Fires lease.lost at the old
        /// holder and resolves its in-flight mutating reqs with LEASE_LOST.
        /// Returns the previous holder (null if none / expired / same).
        /// </summary>
        public static string Takeover(string sessionId, long ttlMs = 0)
        {
            if (string.IsNullOrEmpty(sessionId)) return null;
            string old;
            long ttlTicks = ClampTtlTicks(ttlMs);
            lock (_gate)
            {
                old = EffectiveHolderLocked(DateTime.UtcNow.Ticks);
                _holder = sessionId;
                _holderTtlTicks = ttlTicks;
                _expiresUtcTicks = DateTime.UtcNow.Ticks + ttlTicks;
            }
            PersistNow();
            if (old != null && old != sessionId)
            {
                Dispatcher.FailInFlightMutating(old,
                    ErrorObj.Make(ErrorCodes.LeaseLost, "write lease taken over by '" + sessionId + "'"));
                TcpHost host = TcpHost.Current;
                if (host != null)
                {
                    host.SendToSession(old, Frames.Event(EventKind.LeaseLost, new { newHolder = sessionId }));
                }
                return old;
            }
            return null;
        }

        /// <summary>Effective holder (null when expired). Safe from any thread.</summary>
        public static string CurrentHolder()
        {
            lock (_gate) return EffectiveHolderLocked(DateTime.UtcNow.Ticks);
        }

        /// <summary>{holder?, ttlMsRemaining?} for sys.status / lease.status. Safe from any thread.</summary>
        public static object StatusObject()
        {
            string holder;
            long remainingMs = 0;
            lock (_gate)
            {
                long now = DateTime.UtcNow.Ticks;
                holder = EffectiveHolderLocked(now);
                if (holder != null)
                {
                    remainingMs = (_expiresUtcTicks - now) / TimeSpan.TicksPerMillisecond;
                    if (remainingMs < 0) remainingMs = 0;
                }
            }
            if (holder == null) return new { holder = (string)null };
            return new { holder, ttlMsRemaining = remainingMs };
        }

        /// <summary>Persist holder id. MAIN THREAD ONLY (SessionState).</summary>
        public static void PersistNow()
        {
            string holder;
            lock (_gate) holder = _holder;
            SessionState.SetString(HolderKey, holder ?? "");
        }

        private static string EffectiveHolderLocked(long nowTicks)
        {
            if (_holder == null) return null;
            return nowTicks >= _expiresUtcTicks ? null : _holder;
        }
    }
}
