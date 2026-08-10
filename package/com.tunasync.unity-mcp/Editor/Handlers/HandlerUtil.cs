// Shared helpers for P3 handlers: hierarchy paths, scene object resolution,
// and reflection utilities used by the compile-gated VRC/NDMF handlers
// (reflection keeps the asmdef reference list empty: VRC SDK types live in
// precompiled dlls we deliberately do not reference).
using System;
using System.Collections.Generic;
using System.Reflection;
using System.Text;
using UnityEditor;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace TunaSync.UnityMCP.Editor
{
    internal static class HandlerUtil
    {
        // ---- hierarchy paths ------------------------------------------------

        /// <summary>"A/B/C" style path (no leading slash), scene-agnostic.</summary>
        public static string GetHierarchyPath(Transform t)
        {
            if (t == null) return "";
            StringBuilder sb = new StringBuilder(t.name);
            Transform cur = t.parent;
            while (cur != null)
            {
                sb.Insert(0, '/').Insert(0, cur.name);
                cur = cur.parent;
            }
            return sb.ToString();
        }

        /// <summary>
        /// Find a scene object by exact hierarchy path ("A/B/C"), including
        /// inactive objects, across all loaded scenes. Null when absent.
        /// </summary>
        public static GameObject FindSceneObjectByPath(string path)
        {
            if (string.IsNullOrEmpty(path)) return null;
            string[] parts = path.Trim('/').Split('/');
            for (int s = 0; s < SceneManager.sceneCount; s++)
            {
                Scene scene = SceneManager.GetSceneAt(s);
                if (!scene.isLoaded) continue;
                GameObject[] roots = scene.GetRootGameObjects();
                for (int r = 0; r < roots.Length; r++)
                {
                    if (roots[r].name != parts[0]) continue;
                    Transform cur = roots[r].transform;
                    bool ok = true;
                    for (int i = 1; i < parts.Length && ok; i++)
                    {
                        cur = cur.Find(parts[i]);
                        if (cur == null) ok = false;
                    }
                    if (ok && cur != null) return cur.gameObject;
                }
            }
            return null;
        }

        // ---- F-13: scene object OR prefab asset -----------------------------

        /// <summary>
        /// Does this look like a project asset path rather than a scene
        /// hierarchy path? ndmf.bake answers with a prefab ASSET path
        /// ("Assets/UnityMCP_Bakes/&lt;avatar&gt;_&lt;ts&gt;/&lt;avatar&gt;_baked.prefab"), but the
        /// avatar/menu audits only ever resolved scene objects - so the
        /// textureMegabytes note telling people to "audit the baked result"
        /// could not be followed with these tools (F-13).
        /// </summary>
        public static bool LooksLikePrefabAssetPath(string path)
        {
            if (string.IsNullOrEmpty(path)) return false;
            string p = path.Replace('\\', '/').Trim();
            if (!p.EndsWith(".prefab", StringComparison.OrdinalIgnoreCase)) return false;
            return p.StartsWith("Assets/", StringComparison.OrdinalIgnoreCase)
                || p.StartsWith("Packages/", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// An object resolved for the duration of ONE read-only handler call.
        /// A prefab asset is instantiated (plain copy, HideFlags.DontSave so it
        /// never reaches the saved scene) and destroyed on Dispose; a scene
        /// object is returned as-is and never destroyed. Always use with
        /// `using` - an audit of a baked prefab must leave nothing behind.
        /// </summary>
        public struct ResolvedObject : IDisposable
        {
            public GameObject Instance;
            public bool Temporary;
            public string AssetPath;

            public void Dispose()
            {
                if (Temporary && Instance != null) UnityEngine.Object.DestroyImmediate(Instance);
                Instance = null;
            }
        }

        /// <summary>
        /// Resolve a scene hierarchy path first (unchanged behaviour), then a
        /// prefab asset path. Empty result when neither resolves.
        /// </summary>
        public static ResolvedObject ResolveSceneOrPrefab(string path)
        {
            ResolvedObject r = new ResolvedObject();
            if (string.IsNullOrEmpty(path)) return r;
            GameObject inScene = FindSceneObjectByPath(path);
            if (inScene != null)
            {
                r.Instance = inScene;
                return r;
            }
            if (!LooksLikePrefabAssetPath(path)) return r;
            string norm = path.Replace('\\', '/').Trim();
            GameObject asset = AssetDatabase.LoadAssetAtPath<GameObject>(norm);
            if (asset == null) return r;
            // Plain Instantiate, not PrefabUtility: an audit wants a throwaway
            // copy, not a prefab instance with override tracking.
            GameObject copy = UnityEngine.Object.Instantiate(asset);
            if (copy == null) return r;
            copy.name = asset.name;
            copy.hideFlags = HideFlags.DontSave;
            r.Instance = copy;
            r.Temporary = true;
            r.AssetPath = norm;
            return r;
        }

        /// <summary>All loaded-scene root objects (every loaded scene).</summary>
        public static List<GameObject> GetAllSceneRoots()
        {
            List<GameObject> roots = new List<GameObject>();
            for (int s = 0; s < SceneManager.sceneCount; s++)
            {
                Scene scene = SceneManager.GetSceneAt(s);
                if (!scene.isLoaded) continue;
                roots.AddRange(scene.GetRootGameObjects());
            }
            return roots;
        }

        // ---- reflection (legacy-proven access pattern for optional SDKs) ----

        /// <summary>Find a type by full name across all loaded assemblies.</summary>
        public static Type FindType(string fullName)
        {
            Assembly[] assemblies = AppDomain.CurrentDomain.GetAssemblies();
            for (int i = 0; i < assemblies.Length; i++)
            {
                try
                {
                    Type t = assemblies[i].GetType(fullName, false);
                    if (t != null) return t;
                }
                catch { }
            }
            return null;
        }

        /// <summary>All components under root (inclusive) whose type SHORT name matches.</summary>
        public static List<Component> ComponentsByTypeName(GameObject root, string shortName)
        {
            List<Component> result = new List<Component>();
            if (root == null) return result;
            Component[] all = root.GetComponentsInChildren<Component>(true);
            for (int i = 0; i < all.Length; i++)
            {
                if (all[i] != null && all[i].GetType().Name == shortName) result.Add(all[i]);
            }
            return result;
        }

        public static object GetFieldOrProp(object obj, string name)
        {
            if (obj == null || string.IsNullOrEmpty(name)) return null;
            Type t = obj.GetType();
            try
            {
                FieldInfo f = t.GetField(name,
                    BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                if (f != null) return f.GetValue(obj);
                PropertyInfo p = t.GetProperty(name,
                    BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                if (p != null && p.CanRead) return p.GetValue(obj, null);
            }
            catch { }
            return null;
        }

        public static bool TrySetProp(object obj, string name, object value)
        {
            if (obj == null) return false;
            try
            {
                PropertyInfo p = obj.GetType().GetProperty(name,
                    BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                if (p == null || !p.CanWrite) return false;
                p.SetValue(obj, value, null);
                return true;
            }
            catch
            {
                return false;
            }
        }

        public static bool TrySetField(object obj, string name, object value)
        {
            if (obj == null) return false;
            try
            {
                FieldInfo f = obj.GetType().GetField(name,
                    BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                if (f == null) return false;
                f.SetValue(obj, value);
                return true;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Harvest simple public instance fields (int/int?/bool/enum/string/float)
        /// into a name-to-value dictionary. Used for AvatarPerformanceStats so
        /// field-name drift across SDK versions cannot break the audit.
        /// </summary>
        public static Dictionary<string, object> HarvestSimpleFields(object obj)
        {
            Dictionary<string, object> map = new Dictionary<string, object>(StringComparer.Ordinal);
            if (obj == null) return map;
            FieldInfo[] fields = obj.GetType().GetFields(BindingFlags.Instance | BindingFlags.Public);
            for (int i = 0; i < fields.Length; i++)
            {
                try
                {
                    object value = fields[i].GetValue(obj);
                    if (value == null) continue;
                    Type vt = value.GetType();
                    if (vt.IsEnum) map[fields[i].Name] = value.ToString();
                    else if (value is int || value is bool || value is float ||
                             value is long || value is double || value is string)
                    {
                        map[fields[i].Name] = value;
                    }
                }
                catch { }
            }
            return map;
        }
    }
}
