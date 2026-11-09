using NUnit.Framework;

namespace TunaSync.UnityMCP.Editor.Tests
{
    // 2.6.10: updating existing avatars is fail-closed like worlds - only the
    // signed-in SDK user's own, already-private content may be replaced.
    public sealed class ExistingContentRefusalTests
    {
        private const string Id = "avtr_00000000-0000-0000-0000-000000000001";
        private const string Me = "usr_00000000-0000-0000-0000-00000000000a";

        [Test]
        public void OwnPrivateContentMayBeUpdated()
        {
            Assert.IsNull(VrcUploadExecutor.ExistingContentRefusal(Id, Id, Me, Me, "private"));
        }

        [Test]
        public void PublicContentIsRefused()
        {
            StringAssert.Contains("not private",
                VrcUploadExecutor.ExistingContentRefusal(Id, Id, Me, Me, "public"));
        }

        [Test]
        public void SomeoneElsesContentIsRefused()
        {
            StringAssert.Contains("not owned",
                VrcUploadExecutor.ExistingContentRefusal(Id, Id, "usr_other", Me, "private"));
        }

        [Test]
        public void IdentityMismatchIsRefused()
        {
            StringAssert.Contains("identity",
                VrcUploadExecutor.ExistingContentRefusal(Id, "avtr_other", Me, Me, "private"));
        }

        [Test]
        public void UnknownValuesAreRefused()
        {
            Assert.IsNotNull(VrcUploadExecutor.ExistingContentRefusal(Id, Id, Me, null, "private"));
            Assert.IsNotNull(VrcUploadExecutor.ExistingContentRefusal(Id, Id, null, Me, "private"));
            Assert.IsNotNull(VrcUploadExecutor.ExistingContentRefusal(Id, Id, Me, Me, null));
            Assert.IsNotNull(VrcUploadExecutor.ExistingContentRefusal(null, null, Me, Me, "private"));
        }
    }
}
