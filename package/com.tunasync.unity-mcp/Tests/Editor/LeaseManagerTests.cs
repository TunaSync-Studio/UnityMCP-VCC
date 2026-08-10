using NUnit.Framework;

namespace TunaSync.UnityMCP.Editor.Tests
{
    // F-6 (2.6.3): the write path auto-refreshes through TryAcquire with no
    // explicit ttl; that must not roll a custom TTL back to the 120 s default
    // (a 900 s lease dropping to 2 min mid-job opened a takeover window).
    public sealed class LeaseManagerTests
    {
        private const string Session = "test-f6-session";

        [TearDown]
        public void ReleaseLease()
        {
            LeaseManager.Release(Session);
        }

        [Test]
        public void ImplicitWriteRefreshKeepsCustomTtl()
        {
            Assert.IsTrue(LeaseManager.TryAcquire(Session, 900000));
            Assert.AreEqual(900000, LeaseManager.CurrentTtlMs());
            Assert.IsTrue(LeaseManager.EnsureHeldForWrite(Session));
            Assert.AreEqual(900000, LeaseManager.CurrentTtlMs());
        }

        [Test]
        public void ExplicitTtlOnRefreshStillApplies()
        {
            Assert.IsTrue(LeaseManager.TryAcquire(Session, 900000));
            Assert.IsTrue(LeaseManager.TryAcquire(Session, 30000));
            Assert.AreEqual(30000, LeaseManager.CurrentTtlMs());
        }

        [Test]
        public void NewAcquisitionWithoutTtlUsesDefault()
        {
            Assert.IsTrue(LeaseManager.TryAcquire(Session));
            Assert.AreEqual((long)LeaseManager.TtlMs, LeaseManager.CurrentTtlMs());
        }
    }
}
