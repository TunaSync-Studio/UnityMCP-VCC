// Main-thread work pump.
// Transport threads enqueue work here; EditorApplication.update drains the
// queue with a 50 ms budget per tick. Each tick also publishes an immutable
// snapshot (last tick time, compiling, playing) that transport threads read
// without touching any Unity API, so ping / sys.status keep working while the
// main thread is stuck in a compile or a modal dialog.
using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using UnityEditor;
using Debug = UnityEngine.Debug;

namespace TunaSync.UnityMCP.Editor
{
    public static class MainThreadPump
    {
        /// <summary>
        /// Immutable snapshot published by the pump each tick. Held behind a
        /// volatile reference (an atomic publish; a multi-field struct could
        /// tear when read from another thread).
        /// </summary>
        public sealed class Snapshot
        {
            public readonly long LastTickUtcTicks;
            public readonly bool Compiling;
            public readonly bool IsPlaying;

            public Snapshot(long lastTickUtcTicks, bool compiling, bool isPlaying)
            {
                LastTickUtcTicks = lastTickUtcTicks;
                Compiling = compiling;
                IsPlaying = isPlaying;
            }
        }

        private const long DrainBudgetMs = 50;

        private static readonly ConcurrentQueue<Func<Task>> _queue = new ConcurrentQueue<Func<Task>>();
        private static readonly object _tickerGate = new object();
        private static volatile Action[] _tickers = new Action[0];
        private static volatile Snapshot _snapshot;
        private static int _mainThreadId = -1;
        private static bool _initialized;

        /// <summary>Main thread only. Called once from Bootstrap.</summary>
        public static void Init()
        {
            if (_initialized) return;
            _initialized = true;
            _mainThreadId = Thread.CurrentThread.ManagedThreadId;
            PublishSnapshot();
            EditorApplication.update += OnUpdate;
        }

        public static bool IsMainThread => Thread.CurrentThread.ManagedThreadId == _mainThreadId;

        /// <summary>Latest published snapshot. Safe from any thread. Null before Init.</summary>
        public static Snapshot Current => _snapshot;

        /// <summary>Milliseconds since the last pump tick, computed off-thread. Safe from any thread.</summary>
        public static long LastTickAgoMs
        {
            get
            {
                Snapshot s = _snapshot;
                if (s == null) return 0;
                long ago = (DateTime.UtcNow.Ticks - s.LastTickUtcTicks) / TimeSpan.TicksPerMillisecond;
                return ago < 0 ? 0 : ago;
            }
        }

        /// <summary>Enqueue synchronous work for the main thread. Safe from any thread.</summary>
        public static void Post(Action action)
        {
            if (action == null) return;
            Post(() =>
            {
                action();
                return Task.CompletedTask;
            });
        }

        /// <summary>
        /// Enqueue async work for the main thread. The delegate starts on the
        /// main thread inside EditorApplication.update; awaits resume on the
        /// main thread via Unity's SynchronizationContext. Safe from any thread.
        /// </summary>
        public static void Post(Func<Task> work)
        {
            if (work == null) return;
            _queue.Enqueue(work);
        }

        /// <summary>Register an action invoked at the start of every pump tick (main thread).</summary>
        public static void AddTicker(Action ticker)
        {
            if (ticker == null) return;
            lock (_tickerGate)
            {
                Action[] next = new Action[_tickers.Length + 1];
                Array.Copy(_tickers, next, _tickers.Length);
                next[_tickers.Length] = ticker;
                _tickers = next;
            }
        }

        private static void PublishSnapshot()
        {
            _snapshot = new Snapshot(
                DateTime.UtcNow.Ticks,
                EditorApplication.isCompiling,
                EditorApplication.isPlaying);
        }

        private static void OnUpdate()
        {
            PublishSnapshot();

            Action[] tickers = _tickers;
            for (int i = 0; i < tickers.Length; i++)
            {
                try { tickers[i](); }
                catch (Exception ex) { Debug.LogError("[UnityMCP] pump ticker failed: " + ex); }
            }

            if (_queue.IsEmpty) return;

            Stopwatch sw = Stopwatch.StartNew();
            Func<Task> work;
            while (sw.ElapsedMilliseconds < DrainBudgetMs && _queue.TryDequeue(out work))
            {
                try
                {
                    Task t = work();
                    if (t == null) continue;
                    if (t.IsCompleted) LogFaultIfAny(t);
                    else Observe(t);
                }
                catch (Exception ex)
                {
                    Debug.LogError("[UnityMCP] pump work item threw synchronously: " + ex);
                }
            }
        }

        private static void Observe(Task t)
        {
            t.ContinueWith(
                LogFaultIfAny,
                CancellationToken.None,
                TaskContinuationOptions.OnlyOnFaulted,
                TaskScheduler.Default);
        }

        private static void LogFaultIfAny(Task t)
        {
            if (!t.IsFaulted || t.Exception == null) return;
            // Debug.LogError is documented thread-safe; this may run on a pool thread.
            Debug.LogError("[UnityMCP] pump work item faulted: " + t.Exception.GetBaseException());
        }
    }
}
