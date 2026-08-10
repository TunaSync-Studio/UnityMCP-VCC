using System.Collections.Generic;
using NUnit.Framework;

namespace TunaSync.UnityMCP.Editor.Tests
{
    // F-11 (2026-08-10): vrc.menuAudit read only `control.parameter`, so every
    // Radial/TwoAxis/FourAxis puppet - whose parameters live in
    // `subParameters` - was written off as "no-parameter" and skipped all three
    // audit axes. Working puppets looked broken; broken ones were invisible.
    //
    // The production reflection is name-based, so these fakes mirror
    // VRCExpressionsMenu.Control by SHAPE and exercise the real code path with
    // no VRChat SDK in the project.
    public sealed class MenuControlParamsTests
    {
        private sealed class FakeParam
        {
            public string name;
            public FakeParam(string n) { name = n; }
        }

        private sealed class FakeControl
        {
            public string name = "ctl";
            public FakeParam parameter;
            public FakeParam[] subParameters;
        }

        private static FakeParam[] Subs(params string[] names)
        {
            FakeParam[] a = new FakeParam[names.Length];
            for (int i = 0; i < names.Length; i++) a[i] = new FakeParam(names[i]);
            return a;
        }

        [Test]
        public void RadialPuppetParameterComesFromSubParameters()
        {
            FakeControl c = new FakeControl
            {
                parameter = new FakeParam(""),
                subParameters = Subs("Breast_Size"),
            };
            Assert.AreEqual("", MenuControlParams.MainName(c));
            CollectionAssert.AreEqual(new[] { "Breast_Size" }, MenuControlParams.Names(c));
        }

        [Test]
        public void TwoAxisPuppetKeepsBothAxesInOrder()
        {
            FakeControl c = new FakeControl { subParameters = Subs("AxisX", "AxisY") };
            CollectionAssert.AreEqual(new[] { "AxisX", "AxisY" }, MenuControlParams.Names(c));
            CollectionAssert.AreEqual(new[] { "AxisX", "AxisY" }, MenuControlParams.SubNames(c));
        }

        [Test]
        public void ToggleStillUsesTheMainParameter()
        {
            FakeControl c = new FakeControl { parameter = new FakeParam("Kemono_Ear") };
            CollectionAssert.AreEqual(new[] { "Kemono_Ear" }, MenuControlParams.Names(c));
            Assert.AreEqual(0, MenuControlParams.SubNames(c).Count);
        }

        [Test]
        public void DuplicateAcrossMainAndSubIsCollapsed()
        {
            FakeControl c = new FakeControl
            {
                parameter = new FakeParam("P"),
                subParameters = Subs("P", ""),
            };
            CollectionAssert.AreEqual(new[] { "P" }, MenuControlParams.Names(c));
        }

        [Test]
        public void NothingWiredYieldsNoNames()
        {
            FakeControl c = new FakeControl { parameter = new FakeParam(""), subParameters = Subs("", "") };
            Assert.AreEqual(0, MenuControlParams.Names(c).Count);
            Assert.AreEqual("no-parameter", MenuControlParams.Verdict(false, 0, true, true, 0, 0));
            Assert.AreEqual("submenu", MenuControlParams.Verdict(true, 0, true, true, 0, 0));
        }

        [Test]
        public void VerdictTakesTheWorstAxisOfAnyParameter()
        {
            // one undeclared axis condemns the whole control
            Assert.AreEqual("parameter-not-declared",
                MenuControlParams.Verdict(false, 2, false, true, 4, 4));
            Assert.AreEqual("parameter-unused-by-animator",
                MenuControlParams.Verdict(false, 2, true, false, 4, 4));
            Assert.AreEqual("dead-menu-item",
                MenuControlParams.Verdict(false, 1, true, true, 3, 0));
            Assert.AreEqual("partially-missing",
                MenuControlParams.Verdict(false, 2, true, true, 4, 3));
            Assert.AreEqual("ok",
                MenuControlParams.Verdict(false, 1, true, true, 2, 2));
            // no animated paths at all is still ok (axis 3 has nothing to say)
            Assert.AreEqual("ok",
                MenuControlParams.Verdict(false, 1, true, true, 0, 0));
        }
    }
}
