using NUnit.Framework;

namespace TunaSync.UnityMCP.Editor.Tests
{
    // F-13 (2026-08-10): ndmf.bake answers with a prefab ASSET path, but the
    // avatar/menu audits resolved scene objects only - so the textureMegabytes
    // note telling people to "audit the baked result" could not be followed.
    // The audits now accept an asset path; this guards the predicate that
    // decides when to try loading one (no VRChat SDK needed).
    public sealed class HandlerUtilPathTests
    {
        [Test]
        public void BakedPrefabPathIsRecognised()
        {
            Assert.IsTrue(HandlerUtil.LooksLikePrefabAssetPath(
                "Assets/UnityMCP_Bakes/Plum_kisekae_20260810_103732/Plum_kisekae_baked.prefab"));
            Assert.IsTrue(HandlerUtil.LooksLikePrefabAssetPath("Packages/com.x.y/Runtime/A.prefab"));
        }

        [Test]
        public void BackslashesAndCasingAreTolerated()
        {
            Assert.IsTrue(HandlerUtil.LooksLikePrefabAssetPath(@"Assets\Bakes\A_baked.PREFAB"));
            Assert.IsTrue(HandlerUtil.LooksLikePrefabAssetPath("assets/bakes/a.prefab"));
        }

        [Test]
        public void SceneHierarchyPathsAreNotAssetPaths()
        {
            // the common case: a scene object path must keep resolving as one
            Assert.IsFalse(HandlerUtil.LooksLikePrefabAssetPath("Plum_kisekae"));
            Assert.IsFalse(HandlerUtil.LooksLikePrefabAssetPath("Root/Child/Grandchild"));
        }

        [Test]
        public void NonPrefabAssetsAndEmptyInputsAreRejected()
        {
            Assert.IsFalse(HandlerUtil.LooksLikePrefabAssetPath("Assets/Foo/Bar.asset"));
            Assert.IsFalse(HandlerUtil.LooksLikePrefabAssetPath("Assets/Foo/Bar.fbx"));
            Assert.IsFalse(HandlerUtil.LooksLikePrefabAssetPath("SomeWhereElse/A.prefab"));
            Assert.IsFalse(HandlerUtil.LooksLikePrefabAssetPath(""));
            Assert.IsFalse(HandlerUtil.LooksLikePrefabAssetPath(null));
        }
    }
}
