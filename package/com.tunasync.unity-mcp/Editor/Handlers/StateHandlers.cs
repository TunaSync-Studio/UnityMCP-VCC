// Read-only editor state surface: state.get, scene.query, logs.get, logs.clear.
// state.get enforces maxBytes on the SERIALIZED payload (sections are added in
// requested order until the next one would exceed the cap) - the fix for the
// legacy unbounded get_editor_state.
using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace TunaSync.UnityMCP.Editor
{
    internal static class StateHandlers
    {
        private const int DefaultMaxBytes = 30000;
        private const int MinMaxBytes = 1000;
        private const int MaxMaxBytes = 5 * 1024 * 1024;
        private const int DefaultHierarchyDepth = 6;

        public static void RegisterAll()
        {
            Dispatcher.RegisterMethod("state.get", false, StateGet);
            Dispatcher.RegisterMethod("scene.query", false, SceneQuery);
            Dispatcher.RegisterMethod("logs.get", false, LogsGet);
            Dispatcher.RegisterMethod("logs.clear", false, LogsClear);
        }

        // ---- state.get ------------------------------------------------------

        private static Task<object> StateGet(JObject p, RequestContext ctx)
        {
            string[] sections = ReadStringArray(p, "sections");
            if (sections == null || sections.Length == 0) sections = new[] { "summary" };
            int maxBytes = Clamp(ReadInt(p, "maxBytes", DefaultMaxBytes), MinMaxBytes, MaxMaxBytes);
            int depth = Clamp(ReadInt(p, "hierarchyDepth", DefaultHierarchyDepth), 1, 32);

            JObject result = new JObject();
            JObject sectionsObj = new JObject();
            result["sections"] = sectionsObj;
            JArray unknown = new JArray();
            bool truncated = false;

            int budget = maxBytes - 96; // envelope + truncation-note overhead
            int used = 0;

            for (int i = 0; i < sections.Length; i++)
            {
                string name = (sections[i] ?? "").Trim();
                JToken built = BuildSection(name, depth);
                if (built == null)
                {
                    unknown.Add(name);
                    continue;
                }
                int cost = Protocol.Serialize(built).Length + name.Length + 8;
                if (used + cost > budget)
                {
                    truncated = true;
                    break; // stop adding once the next section would exceed the cap
                }
                sectionsObj[name] = built;
                used += cost;
            }

            if (unknown.Count > 0) result["unknownSections"] = unknown;
            if (truncated)
            {
                result["truncated"] = true;
                result["hint"] = "narrow sections or raise maxBytes";
            }
            return Task.FromResult<object>(result);
        }

        private static JToken BuildSection(string name, int hierarchyDepth)
        {
            switch (name)
            {
                case "summary": return BuildSummary();
                case "hierarchy": return BuildHierarchy(hierarchyDepth);
                case "selection": return BuildSelection();
                case "project": return BuildProject();
                case "packages": return BuildPackages();
                default: return null;
            }
        }

        private static JToken BuildSummary()
        {
            Scene scene = SceneManager.GetActiveScene();
            JObject o = new JObject();
            o["sceneName"] = scene.name;
            o["scenePath"] = scene.path;
            o["sceneDirty"] = scene.isDirty;
            o["selectionCount"] = Selection.objects != null ? Selection.objects.Length : 0;
            o["rootObjectCount"] = scene.rootCount;
            o["packageProject"] = HasEmbeddedPackages(); // embedded package dev project
            return o;
        }

        private static bool HasEmbeddedPackages()
        {
            try
            {
                string packagesDir = Path.Combine(McpEditorInfo.ProjectPath, "Packages");
                if (!Directory.Exists(packagesDir)) return false;
                string[] dirs = Directory.GetDirectories(packagesDir);
                for (int i = 0; i < dirs.Length; i++)
                {
                    if (File.Exists(Path.Combine(dirs[i], "package.json"))) return true;
                }
                return false;
            }
            catch
            {
                return false;
            }
        }

        private static JToken BuildHierarchy(int maxDepth)
        {
            JArray roots = new JArray();
            List<GameObject> sceneRoots = HandlerUtil.GetAllSceneRoots();
            for (int i = 0; i < sceneRoots.Count; i++)
            {
                roots.Add(BuildNode(sceneRoots[i].transform, maxDepth, 1));
            }
            return roots;
        }

        private static JObject BuildNode(Transform t, int maxDepth, int depth)
        {
            JObject node = new JObject();
            node["name"] = t.name;
            node["activeSelf"] = t.gameObject.activeSelf;
            node["components"] = new JArray(ComponentShortNames(t.gameObject));
            node["childCount"] = t.childCount;
            if (depth < maxDepth && t.childCount > 0)
            {
                JArray children = new JArray();
                for (int i = 0; i < t.childCount; i++)
                {
                    children.Add(BuildNode(t.GetChild(i), maxDepth, depth + 1));
                }
                node["children"] = children;
            }
            return node;
        }

        private static string[] ComponentShortNames(GameObject go)
        {
            Component[] comps = go.GetComponents<Component>();
            string[] names = new string[comps.Length];
            for (int i = 0; i < comps.Length; i++)
            {
                names[i] = comps[i] != null ? comps[i].GetType().Name : "(Missing)";
            }
            return names;
        }

        private static JToken BuildSelection()
        {
            JArray paths = new JArray();
            UnityEngine.Object[] objs = Selection.objects;
            if (objs == null) return paths;
            for (int i = 0; i < objs.Length; i++)
            {
                UnityEngine.Object o = objs[i];
                if (o == null) continue;
                GameObject go = o as GameObject;
                if (go != null && go.scene.IsValid())
                {
                    paths.Add(HandlerUtil.GetHierarchyPath(go.transform));
                    continue;
                }
                string assetPath = AssetDatabase.GetAssetPath(o);
                paths.Add(!string.IsNullOrEmpty(assetPath) ? "asset:" + assetPath : o.name);
            }
            return paths;
        }

        private static JToken BuildProject()
        {
            JArray folders = new JArray();
            string dataPath = Application.dataPath;
            string[] dirs;
            try { dirs = Directory.GetDirectories(dataPath); }
            catch { return folders; }
            for (int i = 0; i < dirs.Length; i++)
            {
                JObject f = new JObject();
                f["name"] = Path.GetFileName(dirs[i]);
                f["files"] = CountFiles(dirs[i]);
                folders.Add(f);
            }
            return folders;
        }

        private static int CountFiles(string dir)
        {
            int count = 0;
            try
            {
                foreach (string file in Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories))
                {
                    if (!file.EndsWith(".meta", StringComparison.OrdinalIgnoreCase)) count++;
                }
            }
            catch { }
            return count;
        }

        private static JToken BuildPackages()
        {
            JObject map = new JObject();
            try
            {
                UnityEditor.PackageManager.PackageInfo[] packages =
                    UnityEditor.PackageManager.PackageInfo.GetAllRegisteredPackages();
                for (int i = 0; i < packages.Length; i++)
                {
                    map[packages[i].name] = packages[i].version;
                }
            }
            catch (Exception ex)
            {
                map["error"] = ex.Message;
            }
            return map;
        }

        // ---- scene.query ----------------------------------------------------

        private static Task<object> SceneQuery(JObject p, RequestContext ctx)
        {
            string query = (ReadString(p, "query") ?? "").Trim();
            string type = ReadString(p, "type");
            string under = ReadString(p, "under");
            if (!string.IsNullOrEmpty(under)) under = under.Trim('/');
            int limit = Clamp(ReadInt(p, "limit", 50), 1, 500);

            // "t:ComponentType" query syntax = type filter, no name constraint.
            if (query.StartsWith("t:", StringComparison.OrdinalIgnoreCase))
            {
                string queryType = query.Substring(2).Trim();
                if (queryType.Length > 0 && string.IsNullOrEmpty(type)) type = queryType;
                query = "";
            }

            if (query.Length == 0 && string.IsNullOrEmpty(type) && string.IsNullOrEmpty(under))
            {
                throw new McpHandlerException(ErrorCodes.InvalidParams,
                    "scene.query: give at least one filter - query (name substring, 'Name*' wildcard " +
                    "or 't:ComponentType'), type, or under");
            }

            // '*' / '?' wildcards become an anchored regex; plain text stays substring.
            Regex nameRegex = null;
            if (query.IndexOf('*') >= 0 || query.IndexOf('?') >= 0)
            {
                string pattern = "^" + Regex.Escape(query).Replace("\\*", ".*").Replace("\\?", ".") + "$";
                nameRegex = new Regex(pattern, RegexOptions.IgnoreCase, TimeSpan.FromMilliseconds(250));
            }

            JArray items = new JArray();
            int total = 0;

            List<Transform> roots = new List<Transform>();
            List<GameObject> sceneRoots = HandlerUtil.GetAllSceneRoots();
            for (int i = 0; i < sceneRoots.Count; i++) roots.Add(sceneRoots[i].transform);

            // Prefab stage content, when one is open.
            PrefabStage stage = PrefabStageUtility.GetCurrentPrefabStage();
            if (stage != null && stage.prefabContentsRoot != null)
            {
                roots.Add(stage.prefabContentsRoot.transform);
            }

            for (int i = 0; i < roots.Count; i++)
            {
                Visit(roots[i], query, nameRegex, type, under, limit, items, ref total);
            }

            JObject result = new JObject();
            result["total"] = total;
            result["items"] = items;
            return Task.FromResult<object>(result);
        }

        private static void Visit(Transform t, string query, Regex nameRegex, string type, string under,
            int limit, JArray items, ref int total)
        {
            string path = HandlerUtil.GetHierarchyPath(t);
            if (Matches(t, path, query, nameRegex, type, under))
            {
                total++;
                if (items.Count < limit)
                {
                    JObject item = new JObject();
                    item["path"] = path;
                    item["name"] = t.name;
                    item["activeInHierarchy"] = t.gameObject.activeInHierarchy;
                    item["components"] = new JArray(ComponentShortNames(t.gameObject));
                    items.Add(item);
                }
            }
            for (int i = 0; i < t.childCount; i++)
            {
                Visit(t.GetChild(i), query, nameRegex, type, under, limit, items, ref total);
            }
        }

        private static bool Matches(Transform t, string path, string query, Regex nameRegex,
            string type, string under)
        {
            if (nameRegex != null)
            {
                bool hit;
                try { hit = nameRegex.IsMatch(t.name); }
                catch (RegexMatchTimeoutException) { hit = false; }
                if (!hit) return false;
            }
            else if (query.Length > 0 &&
                t.name.IndexOf(query, StringComparison.OrdinalIgnoreCase) < 0)
            {
                return false;
            }
            if (!string.IsNullOrEmpty(under))
            {
                if (!path.Equals(under, StringComparison.Ordinal) &&
                    !path.StartsWith(under + "/", StringComparison.Ordinal))
                {
                    return false;
                }
            }
            if (!string.IsNullOrEmpty(type))
            {
                Component[] comps = t.gameObject.GetComponents<Component>();
                bool found = false;
                for (int i = 0; i < comps.Length && !found; i++)
                {
                    if (comps[i] == null) continue;
                    Type ct = comps[i].GetType();
                    // Short name or full name, case-insensitive ("VRCPhysBone" or
                    // "VRC.SDK3.Dynamics.PhysBone.Components.VRCPhysBone").
                    if (string.Equals(ct.Name, type, StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(ct.FullName, type, StringComparison.OrdinalIgnoreCase))
                    {
                        found = true;
                    }
                }
                if (!found) return false;
            }
            return true;
        }

        // ---- logs.get / logs.clear -----------------------------------------

        private static Task<object> LogsGet(JObject p, RequestContext ctx)
        {
            string level = ReadString(p, "level");
            if (level == "warn") level = "warning";
            string pattern = ReadString(p, "regex");
            int count = Clamp(ReadInt(p, "count", 50), 1, 500);
            long sinceId = ReadLong(p, "sinceId", 0);

            Regex rx = null;
            if (!string.IsNullOrEmpty(pattern))
            {
                try
                {
                    rx = new Regex(pattern, RegexOptions.IgnoreCase, TimeSpan.FromMilliseconds(250));
                }
                catch (ArgumentException ex)
                {
                    throw new McpHandlerException(ErrorCodes.InvalidParams,
                        "logs.get: invalid regex: " + ex.Message);
                }
            }

            LogCapture.Entry[] all = LogCapture.Snapshot(0); // full ring, oldest first
            long lastId = all.Length > 0 ? all[all.Length - 1].Id : 0;

            List<LogCapture.Entry> filtered = new List<LogCapture.Entry>();
            for (int i = 0; i < all.Length; i++)
            {
                LogCapture.Entry e = all[i];
                if (e.Id <= sinceId) continue;
                if (level != null && !string.Equals(e.Level, level, StringComparison.OrdinalIgnoreCase)) continue;
                if (rx != null)
                {
                    bool hit;
                    try { hit = e.Message != null && rx.IsMatch(e.Message); }
                    catch (RegexMatchTimeoutException) { hit = false; }
                    if (!hit) continue;
                }
                filtered.Add(e);
            }

            int skip = filtered.Count > count ? filtered.Count - count : 0;
            LogCapture.Entry[] page = new LogCapture.Entry[filtered.Count - skip];
            for (int i = skip; i < filtered.Count; i++) page[i - skip] = filtered[i];

            return Task.FromResult<object>(new
            {
                total = filtered.Count,
                lastId,
                entries = page, // id-ordered, newest last
            });
        }

        private static Task<object> LogsClear(JObject p, RequestContext ctx)
        {
            LogCapture.Clear();

            // Also clear the Unity editor console (internal API; optional).
            bool consoleCleared = false;
            try
            {
                Type logEntries = HandlerUtil.FindType("UnityEditor.LogEntries");
                if (logEntries != null)
                {
                    System.Reflection.MethodInfo clear = logEntries.GetMethod("Clear",
                        System.Reflection.BindingFlags.Static |
                        System.Reflection.BindingFlags.Public |
                        System.Reflection.BindingFlags.NonPublic);
                    if (clear != null)
                    {
                        clear.Invoke(null, null);
                        consoleCleared = true;
                    }
                }
            }
            catch { }

            return Task.FromResult<object>(new { cleared = true, consoleCleared });
        }

        // ---- param helpers --------------------------------------------------

        private static string ReadString(JObject p, string name)
        {
            JToken t = p != null ? p[name] : null;
            return t != null && t.Type != JTokenType.Null ? t.Value<string>() : null;
        }

        private static string[] ReadStringArray(JObject p, string name)
        {
            JToken t = p != null ? p[name] : null;
            JArray arr = t as JArray;
            if (arr == null) return null;
            List<string> result = new List<string>(arr.Count);
            for (int i = 0; i < arr.Count; i++)
            {
                if (arr[i] != null && arr[i].Type == JTokenType.String) result.Add(arr[i].Value<string>());
            }
            return result.ToArray();
        }

        private static int ReadInt(JObject p, string name, int fallback)
        {
            JToken t = p != null ? p[name] : null;
            if (t == null || t.Type == JTokenType.Null) return fallback;
            try { return t.Value<int>(); }
            catch { return fallback; }
        }

        private static long ReadLong(JObject p, string name, long fallback)
        {
            JToken t = p != null ? p[name] : null;
            if (t == null || t.Type == JTokenType.Null) return fallback;
            try { return t.Value<long>(); }
            catch { return fallback; }
        }

        private static int Clamp(int value, int min, int max)
            => value < min ? min : (value > max ? max : value);
    }
}
