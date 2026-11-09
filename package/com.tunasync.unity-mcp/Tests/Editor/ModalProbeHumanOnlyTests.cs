using System.Collections.Generic;
using NUnit.Framework;

namespace TunaSync.UnityMCP.Editor.Tests
{
    // 2.6.10: dialogs that record the user's own decision are reported as
    // kind "human-only" so an agent is told to ask the user instead of
    // reaching for native_dialog (which refuses them server-side as well).
    public sealed class ModalProbeHumanOnlyTests
    {
        [Test]
        public void CopyrightCertificationIsHumanOnly()
        {
            Assert.IsTrue(ModalProbe.IsHumanOnly(
                "Copyright ownership agreement", new List<string> { "OK", "Cancel" }));
        }

        [Test]
        public void AnyChoiceBetweenButtonsIsHumanOnly()
        {
            Assert.IsTrue(ModalProbe.IsHumanOnly("UnlitWF Shader", new List<string> { "OK", "Cancel" }));
            Assert.IsTrue(ModalProbe.IsHumanOnly("Build", new List<string>()));
            Assert.IsTrue(ModalProbe.IsHumanOnly("Build", null));
        }

        [Test]
        public void SingleButtonAgreementOrAccountTitlesAreHumanOnly()
        {
            foreach (string title in new[] { "Terms of Service", "License Agreement", "Sign in", "Consent required" })
            {
                Assert.IsTrue(ModalProbe.IsHumanOnly(title, new List<string> { "OK" }), title);
            }
        }

        [Test]
        public void JapaneseAgreementTitlesAreHumanOnly()
        {
            // 利用規約 / 同意の確認 / ログイン
            foreach (string title in new[] { "利用規約", "同意の確認", "ログイン" })
            {
                Assert.IsTrue(ModalProbe.IsHumanOnly(title, new List<string> { "OK" }), title);
            }
        }

        [Test]
        public void PlainSingleButtonNoticeIsNot()
        {
            Assert.IsFalse(ModalProbe.IsHumanOnly("Preprocess Callback Failed", new List<string> { "OK" }));
        }
    }
}
