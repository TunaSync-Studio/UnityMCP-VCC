// vrc.menuTree / vrc.menuAudit (P2-3): first-class expression-menu
// inspection for avatar maintenance. tree dumps the full menu hierarchy;
// audit judges each control on three axes - (1) parameter declared in
// expressionParameters, (2) parameter present in a source animator,
// (3) the transforms its layers' clips touch actually EXIST. Axis 3 is what
// catches dead menu items (8/8 in the 2026-08-09 field session; the first
// two axes looked "fine" for all of them).
// Judgement runs on SOURCE controllers only: post-bake AAO merges clips into
// BlendTrees and false-positives. Known internal dummies are excluded
// ($AvatarOptimizerClipLengthDummy$ clips, __vrc_internal_empty paths,
// humanoid muscle curves with an empty path).
// Parameter->layer matching is deliberately layer-granular instead of
// transition-graph chasing: gimmicks that span controllers (CLVR-style)
// defeat naive transition walks.
// VRC SDK access is reflection/name-based (same doctrine as VrcHandlers).
#if MCP_VRCSDK3_AVATARS
using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;

namespace TunaSync.UnityMCP.Editor
{
    internal static class VrcMenuHandlers
    {
        public static void RegisterAll()
        {
            Dispatcher.RegisterMethod("vrc.menuTree", false, MenuTree);
            Dispatcher.RegisterMethod("vrc.menuAudit", false, MenuAudit);
        }

        // ---- shared reflection helpers (also used by vrc.avatarAudit P2-2) --

        internal static void CollectDescriptorControllers(
            Component descriptor, HashSet<RuntimeAnimatorController> into)
        {
            if (descriptor == null) return;
            string[] fieldNames = { "baseAnimationLayers", "specialAnimationLayers" };
            for (int i = 0; i < fieldNames.Length; i++)
            {
                FieldInfo f = descriptor.GetType().GetField(fieldNames[i]);
                Array layers = f != null ? f.GetValue(descriptor) as Array : null;
                if (layers == null) continue;
                foreach (object layer in layers)
                {
                    if (layer == null) continue;
                    FieldInfo cf = layer.GetType().GetField("animatorController");
                    RuntimeAnimatorController rc =
                        cf != null ? cf.GetValue(layer) as RuntimeAnimatorController : null;
                    if (rc != null) into.Add(rc);
                }
            }
        }

        private static object Field(object owner, string name)
        {
            if (owner == null) return null;
            FieldInfo f = owner.GetType().GetField(name, BindingFlags.Instance | BindingFlags.Public);
            return f != null ? f.GetValue(owner) : null;
        }

        private static UnityEngine.Object GetMenu(Component descriptor)
        {
            return Field(descriptor, "expressionsMenu") as UnityEngine.Object;
        }

        // F-11: puppet controls keep their parameters in `subParameters` and
        // leave `parameter` empty. Name collection lives in MenuControlParams
        // (outside the SDK gate) so it can be unit-tested with plain fakes.
        private static string ControlParameterName(object control)
        {
            return MenuControlParams.MainName(control);
        }

        // ---- vrc.menuTree ---------------------------------------------------

        private static Task<object> MenuTree(JObject p, RequestContext ctx)
        {
            using (HandlerUtil.ResolvedObject scope = ResolveAvatarScope(p))
            {
                Component descriptor =
                    VrcHandlers.FirstComponentByName(scope.Instance, "VRCAvatarDescriptor");
                UnityEngine.Object rootMenu = GetMenu(descriptor);
                JObject result = new JObject
                {
                    ["avatar"] = HandlerUtil.GetHierarchyPath(descriptor.transform),
                    ["hasMenu"] = rootMenu != null,
                };
                if (scope.Temporary) result["avatarAssetPath"] = scope.AssetPath;
                if (rootMenu != null)
                {
                    result["tree"] = BuildTree(rootMenu, new HashSet<UnityEngine.Object>());
                }
                return Task.FromResult<object>(result);
            }
        }

        private static JArray BuildTree(UnityEngine.Object menu, HashSet<UnityEngine.Object> seen)
        {
            JArray items = new JArray();
            if (menu == null || seen.Contains(menu)) return items;
            seen.Add(menu);
            IList controls = Field(menu, "controls") as IList;
            if (controls == null) return items;
            foreach (object control in controls)
            {
                if (control == null) continue;
                object typeVal = Field(control, "type");
                JObject item = new JObject
                {
                    ["name"] = (Field(control, "name") as string) ?? "",
                    ["type"] = typeVal != null ? typeVal.ToString() : "",
                    ["parameter"] = ControlParameterName(control),
                };
                // F-11: without this a RadialPuppet dumps as parameter:"" and
                // its wiring is invisible in the tree.
                List<string> subPrm = MenuControlParams.SubNames(control);
                if (subPrm.Count > 0)
                {
                    JArray subArr = new JArray();
                    foreach (string s in subPrm) subArr.Add(s);
                    item["subParameters"] = subArr;
                }
                object value = Field(control, "value");
                if (value != null) item["value"] = JToken.FromObject(value);
                UnityEngine.Object sub = Field(control, "subMenu") as UnityEngine.Object;
                if (sub != null)
                {
                    item["submenu"] = sub.name;
                    item["items"] = BuildTree(sub, seen);
                }
                items.Add(item);
            }
            return items;
        }

        // ---- vrc.menuAudit --------------------------------------------------

        private const string DummyClipName = "$AvatarOptimizerClipLengthDummy$";
        private const string DummyPathMarker = "__vrc_internal_empty";

        private static Task<object> MenuAudit(JObject p, RequestContext ctx)
        {
            using (HandlerUtil.ResolvedObject scope = ResolveAvatarScope(p))
            {
            Component descriptor =
                VrcHandlers.FirstComponentByName(scope.Instance, "VRCAvatarDescriptor");
            GameObject avatar = descriptor.gameObject;

            JArray declaredList;
            HashSet<string> declared = DeclaredParameters(descriptor, out declaredList);

            HashSet<RuntimeAnimatorController> controllers = new HashSet<RuntimeAnimatorController>();
            CollectDescriptorControllers(descriptor, controllers);

            Dictionary<string, bool> animatorHas = new Dictionary<string, bool>();
            Dictionary<string, HashSet<string>> paramPaths = new Dictionary<string, HashSet<string>>();
            foreach (RuntimeAnimatorController rc in controllers)
            {
                AnimatorController ac = rc as AnimatorController;
                if (ac == null) continue; // source-only judgement
                AnimatorControllerParameter[] prms = ac.parameters;
                for (int i = 0; i < prms.Length; i++)
                {
                    animatorHas[prms[i].name] = true;
                }
                AnimatorControllerLayer[] layers = ac.layers;
                for (int li = 0; li < layers.Length; li++)
                {
                    HashSet<string> layerParams = new HashSet<string>();
                    List<Motion> motions = new List<Motion>();
                    WalkStateMachine(layers[li].stateMachine, layerParams, motions,
                        new HashSet<AnimatorStateMachine>());
                    if (layerParams.Count == 0) continue;
                    HashSet<string> paths = CollectClipPaths(motions);
                    foreach (string prm in layerParams)
                    {
                        HashSet<string> set;
                        if (!paramPaths.TryGetValue(prm, out set))
                        {
                            set = new HashSet<string>();
                            paramPaths[prm] = set;
                        }
                        set.UnionWith(paths);
                    }
                }
            }

            JArray items = new JArray();
            AuditMenu(GetMenu(descriptor), "", avatar.transform, declared, animatorHas,
                paramPaths, items, new HashSet<UnityEngine.Object>());

            int dead = 0;
            foreach (JToken t in items)
            {
                if ((string)t["verdict"] == "dead-menu-item") dead++;
            }
            JObject result = new JObject
            {
                ["avatar"] = HandlerUtil.GetHierarchyPath(avatar.transform),
                ["parametersDeclared"] = declaredList.Count,
                ["parameters"] = declaredList,
                ["menuItems"] = items.Count,
                ["deadMenuItems"] = dead,
                ["items"] = items,
                ["note"] = "judged on SOURCE controllers (post-bake AAO merges false-positive); " +
                    "humanoid muscle curves (empty path) and known internal dummies excluded",
            };
            if (scope.Temporary) result["avatarAssetPath"] = scope.AssetPath;
            return Task.FromResult<object>(result);
            }
        }

        private static HashSet<string> DeclaredParameters(Component descriptor, out JArray list)
        {
            HashSet<string> names = new HashSet<string>();
            list = new JArray();
            UnityEngine.Object expr = Field(descriptor, "expressionParameters") as UnityEngine.Object;
            Array prms = Field(expr, "parameters") as Array;
            if (prms == null) return names;
            foreach (object prm in prms)
            {
                if (prm == null) continue;
                string n = Field(prm, "name") as string;
                if (string.IsNullOrEmpty(n)) continue;
                names.Add(n);
                object vt = Field(prm, "valueType");
                list.Add(new JObject
                {
                    ["name"] = n,
                    ["valueType"] = vt != null ? vt.ToString() : "",
                });
            }
            return names;
        }

        private static void WalkStateMachine(AnimatorStateMachine sm, HashSet<string> layerParams,
            List<Motion> motions, HashSet<AnimatorStateMachine> seen)
        {
            if (sm == null || seen.Contains(sm)) return;
            seen.Add(sm);
            CollectTransitionParams(sm.anyStateTransitions, layerParams);
            CollectTransitionParams(sm.entryTransitions, layerParams);
            ChildAnimatorState[] states = sm.states;
            for (int i = 0; i < states.Length; i++)
            {
                AnimatorState st = states[i].state;
                if (st == null) continue;
                CollectTransitionParams(st.transitions, layerParams);
                if (st.speedParameterActive && !string.IsNullOrEmpty(st.speedParameter))
                    layerParams.Add(st.speedParameter);
                if (st.timeParameterActive && !string.IsNullOrEmpty(st.timeParameter))
                    layerParams.Add(st.timeParameter);
                if (st.mirrorParameterActive && !string.IsNullOrEmpty(st.mirrorParameter))
                    layerParams.Add(st.mirrorParameter);
                if (st.cycleOffsetParameterActive && !string.IsNullOrEmpty(st.cycleOffsetParameter))
                    layerParams.Add(st.cycleOffsetParameter);
                CollectMotion(st.motion, layerParams, motions, new HashSet<Motion>());
            }
            ChildAnimatorStateMachine[] subs = sm.stateMachines;
            for (int i = 0; i < subs.Length; i++)
            {
                WalkStateMachine(subs[i].stateMachine, layerParams, motions, seen);
            }
        }

        private static void CollectTransitionParams(AnimatorTransitionBase[] ts, HashSet<string> into)
        {
            if (ts == null) return;
            for (int i = 0; i < ts.Length; i++)
            {
                if (ts[i] == null) continue;
                AnimatorCondition[] conds = ts[i].conditions;
                for (int c = 0; c < conds.Length; c++)
                {
                    if (!string.IsNullOrEmpty(conds[c].parameter)) into.Add(conds[c].parameter);
                }
            }
        }

        private static void CollectMotion(Motion motion, HashSet<string> layerParams,
            List<Motion> motions, HashSet<Motion> seen)
        {
            if (motion == null || seen.Contains(motion)) return;
            seen.Add(motion);
            motions.Add(motion);
            BlendTree bt = motion as BlendTree;
            if (bt == null) return;
            if (!string.IsNullOrEmpty(bt.blendParameter)) layerParams.Add(bt.blendParameter);
            if (!string.IsNullOrEmpty(bt.blendParameterY)) layerParams.Add(bt.blendParameterY);
            ChildMotion[] children = bt.children;
            for (int i = 0; i < children.Length; i++)
            {
                if (!string.IsNullOrEmpty(children[i].directBlendParameter))
                    layerParams.Add(children[i].directBlendParameter);
                CollectMotion(children[i].motion, layerParams, motions, seen);
            }
        }

        private static HashSet<string> CollectClipPaths(List<Motion> motions)
        {
            HashSet<string> paths = new HashSet<string>();
            for (int i = 0; i < motions.Count; i++)
            {
                AnimationClip clip = motions[i] as AnimationClip;
                if (clip == null) continue;
                if (clip.name == DummyClipName) continue; // AAO length dummy
                AddBindingPaths(AnimationUtility.GetCurveBindings(clip), paths);
                AddBindingPaths(AnimationUtility.GetObjectReferenceCurveBindings(clip), paths);
            }
            return paths;
        }

        private static void AddBindingPaths(EditorCurveBinding[] bindings, HashSet<string> into)
        {
            if (bindings == null) return;
            for (int i = 0; i < bindings.Length; i++)
            {
                string path = bindings[i].path;
                if (string.IsNullOrEmpty(path)) continue; // humanoid muscle etc.
                if (path.Contains(DummyPathMarker)) continue; // SDK internal empty
                into.Add(path);
            }
        }

        private static void AuditMenu(UnityEngine.Object menu, string prefix, Transform avatarRoot,
            HashSet<string> declared, Dictionary<string, bool> animatorHas,
            Dictionary<string, HashSet<string>> paramPaths, JArray items,
            HashSet<UnityEngine.Object> seen)
        {
            if (menu == null || seen.Contains(menu)) return;
            seen.Add(menu);
            IList controls = Field(menu, "controls") as IList;
            if (controls == null) return;
            foreach (object control in controls)
            {
                if (control == null) continue;
                string name = (Field(control, "name") as string) ?? "";
                object typeVal = Field(control, "type");
                string menuPath = prefix.Length == 0 ? name : prefix + "/" + name;
                UnityEngine.Object sub = Field(control, "subMenu") as UnityEngine.Object;
                if (sub != null)
                {
                    AuditMenu(sub, menuPath, avatarRoot, declared, animatorHas, paramPaths,
                        items, seen);
                }
                string prm = ControlParameterName(control);
                // F-11: judge EVERY parameter the control drives. Puppets keep
                // theirs in subParameters, so reading `parameter` alone made
                // them all look parameterless and skipped all three axes.
                List<string> names = MenuControlParams.Names(control);
                JObject item = new JObject
                {
                    ["menuPath"] = menuPath,
                    ["type"] = typeVal != null ? typeVal.ToString() : "",
                    ["parameter"] = prm,
                };
                if (names.Count > 1 || (names.Count == 1 && names[0] != prm))
                {
                    JArray judged = new JArray();
                    foreach (string n in names) judged.Add(n);
                    item["parameters"] = judged;
                }
                if (names.Count == 0)
                {
                    item["verdict"] = MenuControlParams.Verdict(sub != null, 0, true, true, 0, 0);
                    items.Add(item);
                    continue;
                }
                bool allDeclared = true;
                bool allConsumed = true;
                HashSet<string> union = new HashSet<string>();
                foreach (string n in names)
                {
                    if (!declared.Contains(n)) allDeclared = false;
                    if (!animatorHas.ContainsKey(n)) allConsumed = false;
                    HashSet<string> paths;
                    if (paramPaths.TryGetValue(n, out paths)) union.UnionWith(paths);
                }
                item["declared"] = allDeclared;
                item["animatorHasParameter"] = allConsumed;
                int existing = 0;
                JArray missing = new JArray();
                foreach (string path in union)
                {
                    if (avatarRoot.Find(path) != null) existing++;
                    else if (missing.Count < 20) missing.Add(path);
                }
                item["targetPaths"] = union.Count;
                if (union.Count > 0)
                {
                    item["targetsExisting"] = existing;
                    item["targetsMissing"] = union.Count - existing;
                    if (missing.Count > 0) item["missingSample"] = missing;
                }
                item["verdict"] = MenuControlParams.Verdict(
                    sub != null, names.Count, allDeclared, allConsumed, union.Count, existing);
                items.Add(item);
            }
        }

        /// <summary>
        /// F-13: resolve the avatar as a disposable scope so a baked PREFAB
        /// ASSET path (what ndmf.bake answers with) can be audited too - it is
        /// instantiated as a throwaway copy and destroyed when the scope ends.
        /// Always use with `using`.
        /// </summary>
        private static HandlerUtil.ResolvedObject ResolveAvatarScope(JObject p)
        {
            JToken avTok = p != null ? p["avatar"] : null;
            string avatarPath = avTok != null && avTok.Type != JTokenType.Null
                ? avTok.Value<string>()
                : null;
            if (!string.IsNullOrEmpty(avatarPath))
            {
                HandlerUtil.ResolvedObject r = HandlerUtil.ResolveSceneOrPrefab(avatarPath);
                if (r.Instance == null)
                {
                    // GameObject.Find only sees ACTIVE objects; keep it as the
                    // last resort so previously-working callers do not regress.
                    GameObject legacy = GameObject.Find(avatarPath);
                    if (legacy != null) r.Instance = legacy;
                }
                if (r.Instance == null
                    || VrcHandlers.FirstComponentByName(r.Instance, "VRCAvatarDescriptor") == null)
                {
                    r.Dispose();
                    throw new McpHandlerException(ErrorCodes.InvalidParams,
                        "vrc.menu*: no VRCAvatarDescriptor at '" + avatarPath +
                        "' (scene object path or prefab asset path)");
                }
                return r;
            }
            return ResolveDescriptorInScenes();
        }

        private static HandlerUtil.ResolvedObject ResolveDescriptorInScenes()
        {
            HandlerUtil.ResolvedObject r = new HandlerUtil.ResolvedObject();
            for (int s = 0; s < UnityEngine.SceneManagement.SceneManager.sceneCount; s++)
            {
                UnityEngine.SceneManagement.Scene scene =
                    UnityEngine.SceneManagement.SceneManager.GetSceneAt(s);
                if (!scene.isLoaded) continue;
                GameObject[] roots = scene.GetRootGameObjects();
                for (int i = 0; i < roots.Length; i++)
                {
                    Component d = VrcHandlers.FirstComponentByName(roots[i], "VRCAvatarDescriptor");
                    if (d != null)
                    {
                        r.Instance = d.gameObject;
                        return r;
                    }
                }
            }
            throw new McpHandlerException(ErrorCodes.InvalidParams,
                "vrc.menu*: no avatar found (no VRCAvatarDescriptor in loaded scenes)");
        }
    }
}
#endif
