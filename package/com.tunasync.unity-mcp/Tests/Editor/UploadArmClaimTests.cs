using System;
using System.Globalization;
using System.IO;
using System.Threading;
using NUnit.Framework;

namespace TunaSync.UnityMCP.Editor.Tests
{
    // The plugin is the single consumer of the human VRChat upload arm (the
    // npm server only pre-checks it). These guard the claim itself: one arm =
    // one attempt, also when attempts race (L-3), and fail-safe otherwise.
    public sealed class UploadArmClaimTests
    {
        private string dir;
        private string arm;

        [SetUp]
        public void SetUp()
        {
            dir = Path.Combine(Path.GetTempPath(), "UnityMCP-ArmClaimTests-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(dir);
            arm = Path.Combine(dir, "vrc-upload.arm");
        }

        [TearDown]
        public void TearDown()
        {
            try
            {
                Directory.Delete(dir, true);
            }
            catch (IOException)
            {
            }
            catch (UnauthorizedAccessException)
            {
            }
        }

        [Test]
        public void WelcomeAdvertisesTheArmClaim()
        {
            // The server submits real uploads only to plugins that advertise
            // this exact string (server/src/armGate.ts ARM_CLAIM_FEATURE).
            CollectionAssert.Contains(SysHandlers.BuildFeatures(), "vrcUploadArmClaim");
        }

        [Test]
        public void MissingArmIsNotClaimed()
        {
            Assert.AreEqual(UploadArmClaim.NotFound, UploadArmClaim.TryClaim(arm, 30));
            Assert.AreEqual(0, Directory.GetFiles(dir).Length);
        }

        [Test]
        public void FreshArmIsClaimedExactlyOnce()
        {
            File.WriteAllText(arm, "armed");
            Assert.IsNull(UploadArmClaim.TryClaim(arm, 30));
            Assert.IsFalse(File.Exists(arm), "a successful claim consumes the arm");
            Assert.AreEqual(0, Directory.GetFiles(dir).Length, "no lock or claim leftovers");
            Assert.AreEqual(UploadArmClaim.NotFound, UploadArmClaim.TryClaim(arm, 30));
        }

        [Test]
        public void ExpiredArmIsRefusedAndDiscarded()
        {
            File.WriteAllText(arm, "old");
            File.SetLastWriteTimeUtc(arm, DateTime.UtcNow.AddMinutes(-31));
            string state = UploadArmClaim.TryClaim(arm, 30);
            Assert.IsNotNull(state);
            StringAssert.Contains("expired", state);
            Assert.IsFalse(File.Exists(arm));
            Assert.AreEqual(0, Directory.GetFiles(dir).Length);
        }

        [Test]
        public void FutureDatedArmIsRefusedAndDiscarded()
        {
            // e.g. armed, then the clock was set back: the TTL would not bound it.
            File.WriteAllText(arm, "armed");
            File.SetLastWriteTimeUtc(arm, DateTime.UtcNow.AddMinutes(10));
            string state = UploadArmClaim.TryClaim(arm, 30);
            Assert.IsNotNull(state);
            StringAssert.Contains("in the future", state);
            Assert.IsFalse(File.Exists(arm));
        }

        [Test]
        public void TtlOverrideIsParsedLikeTheServer()
        {
            CultureInfo saved = Thread.CurrentThread.CurrentCulture;
            try
            {
                // "1.5" must not become 15 where ',' is the decimal separator.
                Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE");
                Assert.AreEqual(1.5, UploadArmClaim.ResolveTtlMinutes("1.5", 30));
                Assert.AreEqual(45d, UploadArmClaim.ResolveTtlMinutes(" 45 ", 30));
                Assert.AreEqual(30d, UploadArmClaim.ResolveTtlMinutes(null, 30));
            }
            finally
            {
                Thread.CurrentThread.CurrentCulture = saved;
            }
        }

        [TestCase("")]
        [TestCase("0")]
        [TestCase("-5")]
        [TestCase("abc")]
        [TestCase("Infinity")]
        [TestCase("NaN")]
        [TestCase("1,5")]
        public void InvalidTtlOverrideFallsBackToDefault(string value)
        {
            Assert.AreEqual(30d, UploadArmClaim.ResolveTtlMinutes(value, 30));
        }

        [Test]
        public void HeldClaimLockRefusesAndKeepsTheArm()
        {
            File.WriteAllText(arm, "armed");
            File.WriteAllText(arm + ".lock", "");
            string state = UploadArmClaim.TryClaim(arm, 30);
            Assert.IsNotNull(state);
            StringAssert.Contains("lock is held", state);
            Assert.IsTrue(File.Exists(arm), "a refused claim must not consume the arm");
            Assert.IsTrue(File.Exists(arm + ".lock"), "someone else's lock is left alone");
        }

        [Test]
        public void LeftoverLockIsClearedByTheHumanArmActions()
        {
            // Arm/Disarm (Creator Console, tools/*.bat) clear a lock left behind
            // by a crashed editor; until then every claim is refused.
            File.WriteAllText(arm, "armed");
            File.WriteAllText(UploadArmClaim.LockPathFor(arm), "");
            StringAssert.Contains("lock is held", UploadArmClaim.TryClaim(arm, 30));
            UploadArmClaim.ClearLeftoverLock(arm);
            Assert.IsFalse(File.Exists(UploadArmClaim.LockPathFor(arm)));
            Assert.IsNull(UploadArmClaim.TryClaim(arm, 30));
            UploadArmClaim.ClearLeftoverLock(arm); // nothing left to clear: no-op
            Assert.AreEqual(0, Directory.GetFiles(dir).Length);
        }

        [Test]
        public void ConcurrentClaimsHaveExactlyOneWinner()
        {
            for (int round = 0; round < 50; round++)
            {
                File.WriteAllText(arm, "armed");
                int winners = 0;
                ManualResetEvent go = new ManualResetEvent(false);
                Thread[] threads = new Thread[8];
                for (int i = 0; i < threads.Length; i++)
                {
                    threads[i] = new Thread(() =>
                    {
                        go.WaitOne();
                        if (UploadArmClaim.TryClaim(arm, 30) == null) Interlocked.Increment(ref winners);
                    });
                    threads[i].Start();
                }
                go.Set();
                foreach (Thread t in threads) t.Join();
                go.Close();
                Assert.AreEqual(1, winners, "round " + round);
                Assert.AreEqual(0, Directory.GetFiles(dir).Length, "round " + round + ": leftovers");
            }
        }
    }
}
