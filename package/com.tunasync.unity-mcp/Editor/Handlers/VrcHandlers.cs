// VRChat SDK surface: vrc.upload job executor (avatars/worlds) and
// vrc.avatarAudit (avatars). Entire file is compile-gated on the VRC SDK
// versionDefines. All SDK access is reflection/name-based (legacy-proven
// pattern from UnityMCPPlugin VRCUploadHandler/VRCAuditHandler): the VRC SDK
// ships precompiled dlls that this asmdef deliberately does not reference.
// dryRun is fully implemented; the real upload drives the modern builder API
// (VRCSdkControlPanel.TryGetBuilder<IVRCSdk*BuilderApi>().BuildAndUpload)
// best-effort and needs live TB-3 verification.
#if MCP_VRCSDK3_AVATARS || MCP_VRCSDK3_WORLDS
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq.Expressions;
using System.Reflection;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace TunaSync.UnityMCP.Editor
{
    internal static class VrcHandlers
    {
        public static void RegisterAll()
        {
            JobManager.RegisterExecutor(new VrcUploadExecutor());
#if MCP_VRCSDK3_AVATARS
            Dispatcher.RegisterMethod("vrc.avatarAudit", false, AvatarAudit);
#endif
        }

#if MCP_VRCSDK3_AVATARS
        // ---- vrc.avatarAudit ------------------------------------------------

        private static readonly string[] AllChecks =
            { "performance", "physbones", "expressions", "eyelook", "visemes", "quest" };

        private static Task<object> AvatarAudit(JObject p, RequestContext ctx)
        {
            string avatarPath = ReadString(p, "avatar");
            // F-13: a baked avatar is a PREFAB ASSET, and the textureMegabytes
            // note tells people to audit it - so an asset path has to resolve
            // here too. ResolveSceneOrPrefab instantiates a throwaway copy and
            // the using-block destroys it, leaving the scene untouched.
            using (HandlerUtil.ResolvedObject resolved = ResolveAvatar(avatarPath))
            {
            GameObject avatar = resolved.Instance;
            if (avatar == null)
            {
                throw new McpHandlerException(ErrorCodes.InvalidParams,
                    "vrc.avatarAudit: no avatar found (no VRCAvatarDescriptor in loaded scenes" +
                    (avatarPath != null
                        ? ", and no scene object or prefab asset at '" + avatarPath + "'"
                        : "") + ")");
            }
            Component descriptor = FirstComponentByName(avatar, "VRCAvatarDescriptor");
            if (descriptor == null)
            {
                throw new McpHandlerException(ErrorCodes.InvalidParams,
                    "vrc.avatarAudit: '" + avatar.name + "' has no VRCAvatarDescriptor");
            }

            string[] checks = ReadStringArray(p, "checks");
            if (checks == null || checks.Length == 0) checks = AllChecks;

            JObject result = new JObject();
            result["avatar"] = HandlerUtil.GetHierarchyPath(avatar.transform);
            if (resolved.Temporary) result["avatarAssetPath"] = resolved.AssetPath;
            JObject byCheck = new JObject();
            result["checks"] = byCheck;

            for (int i = 0; i < checks.Length; i++)
            {
                string check = (checks[i] ?? "").Trim();
                // Each check is independent: one failure must not kill the audit.
                try
                {
                    switch (check)
                    {
                        case "performance": byCheck[check] = CheckPerformance(avatar, descriptor); break;
                        case "physbones": byCheck[check] = CheckPhysBones(avatar); break;
                        case "expressions": byCheck[check] = CheckExpressions(descriptor); break;
                        case "eyelook": byCheck[check] = CheckEyeLook(descriptor); break;
                        case "visemes": byCheck[check] = CheckVisemes(descriptor); break;
                        case "quest": byCheck[check] = CheckQuest(avatar); break;
                        default:
                            byCheck[check] = new JObject { ["error"] = "unknown check" };
                            break;
                    }
                }
                catch (Exception ex)
                {
                    byCheck[check] = new JObject { ["error"] = ex.GetType().Name + ": " + ex.Message };
                }
            }
            return Task.FromResult<object>(result);
            }
        }

        private static JToken CheckPerformance(GameObject avatar, Component descriptor)
        {
            JObject o = new JObject();
            object stats = CalculatePerformanceStats(avatar, false);
            if (stats == null)
            {
                o["error"] = "AvatarPerformance.CalculatePerformanceStats not available";
                return o;
            }
            Dictionary<string, object> fields = HandlerUtil.HarvestSimpleFields(stats);
            JObject statsObj = new JObject();
            foreach (KeyValuePair<string, object> kv in fields)
            {
                statsObj[kv.Key] = JToken.FromObject(kv.Value);
            }
            o["stats"] = statsObj;
            o["overall"] = OverallRating(stats);
            AddAnimTextureSupplement(avatar, descriptor, o);
            return o;
        }

        /// <summary>
        /// P2-2: stats.textureMegabytes counts renderer-reachable textures
        /// only - textures reached exclusively through animation
        /// object-reference curves (the Modular Avatar material-swap case)
        /// are invisible to it (~8% of the real total on a measured avatar).
        /// Sum those separately as a runtime-memory estimate so the audit
        /// stops under-reporting near the limits.
        /// </summary>
        private static void AddAnimTextureSupplement(GameObject avatar, Component descriptor, JObject o)
        {
            try
            {
                HashSet<Texture> rendererTex = new HashSet<Texture>();
                Renderer[] renderers = avatar.GetComponentsInChildren<Renderer>(true);
                for (int i = 0; i < renderers.Length; i++)
                {
                    Material[] mats = renderers[i].sharedMaterials;
                    if (mats == null) continue;
                    for (int m = 0; m < mats.Length; m++) AddMaterialTextures(mats[m], rendererTex);
                }

                HashSet<RuntimeAnimatorController> controllers = new HashSet<RuntimeAnimatorController>();
#if MCP_VRCSDK3_AVATARS
                VrcMenuHandlers.CollectDescriptorControllers(descriptor, controllers);
#endif
                Animator[] animators = avatar.GetComponentsInChildren<Animator>(true);
                for (int i = 0; i < animators.Length; i++)
                {
                    if (animators[i].runtimeAnimatorController != null)
                    {
                        controllers.Add(animators[i].runtimeAnimatorController);
                    }
                }

                HashSet<Texture> animTex = new HashSet<Texture>();
                foreach (RuntimeAnimatorController rc in controllers)
                {
                    AnimationClip[] clips = rc.animationClips;
                    if (clips == null) continue;
                    for (int c = 0; c < clips.Length; c++)
                    {
                        AnimationClip clip = clips[c];
                        if (clip == null) continue;
                        EditorCurveBinding[] bindings = AnimationUtility.GetObjectReferenceCurveBindings(clip);
                        for (int b = 0; b < bindings.Length; b++)
                        {
                            ObjectReferenceKeyframe[] keys = AnimationUtility.GetObjectReferenceCurve(clip, bindings[b]);
                            if (keys == null) continue;
                            for (int k = 0; k < keys.Length; k++)
                            {
                                UnityEngine.Object v = keys[k].value;
                                Texture t = v as Texture;
                                if (t != null)
                                {
                                    animTex.Add(t);
                                    continue;
                                }
                                AddMaterialTextures(v as Material, animTex);
                            }
                        }
                    }
                }

                double extraMb = 0;
                int extraCount = 0;
                foreach (Texture t in animTex)
                {
                    if (t == null || rendererTex.Contains(t)) continue;
                    extraCount++;
                    extraMb += UnityEngine.Profiling.Profiler.GetRuntimeMemorySizeLong(t) / (1024.0 * 1024.0);
                }
                o["textureMegabytesAnimOnly"] = Math.Round(extraMb, 2);
                o["textureMegabytesAnimOnlyCount"] = extraCount;
                o["textureMegabytesNote"] =
                    "stats.textureMegabytes counts renderer-reachable textures only (treat as a " +
                    "lower bound); textureMegabytesAnimOnly adds textures reached exclusively " +
                    "through animation object-reference curves (e.g. Modular Avatar material " +
                    "swaps), runtime-size estimate. NOTE: on an UNBAKED avatar this is always 0 " +
                    "- Modular Avatar material swaps become animation curves only during the " +
                    "NDMF build. Run ndmf_bake_run and audit the baked result for the true " +
                    "figure: pass its outputPrefabPath straight back as 'avatar' (a prefab asset " +
                    "path is instantiated for the audit and discarded afterwards)";
            }
            catch (Exception ex)
            {
                o["textureMegabytesNote"] = "anim-texture supplement failed: " + ex.Message;
            }
        }

        private static void AddMaterialTextures(Material mat, HashSet<Texture> into)
        {
            if (mat == null) return;
            string[] names;
            try { names = mat.GetTexturePropertyNames(); }
            catch { return; }
            if (names == null) return;
            for (int i = 0; i < names.Length; i++)
            {
                try
                {
                    Texture t = mat.GetTexture(names[i]);
                    if (t != null) into.Add(t);
                }
                catch { }
            }
        }

        private static string OverallRating(object stats)
        {
            try
            {
                MethodInfo[] methods = stats.GetType().GetMethods(BindingFlags.Instance | BindingFlags.Public);
                for (int i = 0; i < methods.Length; i++)
                {
                    if (methods[i].Name != "GetPerformanceRatingForCategory") continue;
                    ParameterInfo[] prms = methods[i].GetParameters();
                    if (prms.Length != 1 || !prms[0].ParameterType.IsEnum) continue;
                    object overall = Enum.Parse(prms[0].ParameterType, "Overall");
                    object rating = methods[i].Invoke(stats, new[] { overall });
                    return rating != null ? rating.ToString() : null;
                }
            }
            catch { }
            return null;
        }

        private static JToken CheckPhysBones(GameObject avatar)
        {
            List<Component> pbs = HandlerUtil.ComponentsByTypeName(avatar, "VRCPhysBone");
            List<Component> colliders = HandlerUtil.ComponentsByTypeName(avatar, "VRCPhysBoneCollider");
            int affected = 0;
            for (int i = 0; i < pbs.Count; i++)
            {
                Transform root = HandlerUtil.GetFieldOrProp(pbs[i], "rootTransform") as Transform;
                if (root == null) root = pbs[i].transform;
                affected += root.GetComponentsInChildren<Transform>(true).Length;
            }
            return new JObject
            {
                ["count"] = pbs.Count,
                ["colliders"] = colliders.Count,
                ["affectedTransforms"] = affected,
            };
        }

        private static JToken CheckExpressions(Component descriptor)
        {
            object prms = HandlerUtil.GetFieldOrProp(descriptor, "expressionParameters");
            JObject o = new JObject();
            if (prms == null || prms.Equals(null))
            {
                o["present"] = false;
                return o;
            }
            o["present"] = true;

            Array list = HandlerUtil.GetFieldOrProp(prms, "parameters") as Array;
            o["parameterCount"] = list != null ? list.Length : 0;

            try
            {
                MethodInfo calc = prms.GetType().GetMethod("CalcTotalCost",
                    BindingFlags.Instance | BindingFlags.Public);
                if (calc != null && calc.GetParameters().Length == 0)
                {
                    o["totalCostBits"] = Convert.ToInt32(calc.Invoke(prms, null));
                }
            }
            catch { }

            int maxBits = 256;
            try
            {
                FieldInfo max = prms.GetType().GetField("MAX_PARAMETER_COST",
                    BindingFlags.Static | BindingFlags.Public);
                if (max != null) maxBits = Convert.ToInt32(max.GetValue(null));
            }
            catch { }
            o["maxBits"] = maxBits;
            return o;
        }

        private static JToken CheckEyeLook(Component descriptor)
        {
            bool enabled = false;
            object flag = HandlerUtil.GetFieldOrProp(descriptor, "enableEyeLook");
            if (flag is bool b) enabled = b;
            object settings = HandlerUtil.GetFieldOrProp(descriptor, "customEyeLookSettings");
            Transform left = HandlerUtil.GetFieldOrProp(settings, "leftEye") as Transform;
            Transform right = HandlerUtil.GetFieldOrProp(settings, "rightEye") as Transform;
            return new JObject
            {
                ["enabled"] = enabled,
                ["leftEye"] = left != null,
                ["rightEye"] = right != null,
            };
        }

        private static JToken CheckVisemes(Component descriptor)
        {
            object mode = HandlerUtil.GetFieldOrProp(descriptor, "lipSync");
            UnityEngine.Object mesh = HandlerUtil.GetFieldOrProp(descriptor, "VisemeSkinnedMesh") as UnityEngine.Object;
            string[] shapes = HandlerUtil.GetFieldOrProp(descriptor, "VisemeBlendShapes") as string[];
            int mapped = 0;
            if (shapes != null)
            {
                for (int i = 0; i < shapes.Length; i++)
                {
                    if (!string.IsNullOrEmpty(shapes[i])) mapped++;
                }
            }
            return new JObject
            {
                ["mode"] = mode != null ? mode.ToString() : null,
                ["hasVisemeMesh"] = mesh != null,
                ["mappedBlendShapes"] = mapped,
                ["expected"] = 15,
            };
        }

        private static JToken CheckQuest(GameObject avatar)
        {
            // Whitelist from the SDK when available, "VRChat/Mobile/" prefix rule otherwise.
            HashSet<string> whitelist = null;
            try
            {
                Type validation = HandlerUtil.FindType("VRC.SDKBase.Validation.AvatarValidation");
                if (validation != null)
                {
                    FieldInfo wl = validation.GetField("ShaderWhiteList",
                        BindingFlags.Static | BindingFlags.Public);
                    string[] names = wl != null ? wl.GetValue(null) as string[] : null;
                    if (names != null) whitelist = new HashSet<string>(names, StringComparer.Ordinal);
                }
            }
            catch { }

            HashSet<string> offenders = new HashSet<string>(StringComparer.Ordinal);
            Renderer[] renderers = avatar.GetComponentsInChildren<Renderer>(true);
            for (int i = 0; i < renderers.Length; i++)
            {
                Material[] mats = renderers[i].sharedMaterials;
                if (mats == null) continue;
                for (int m = 0; m < mats.Length; m++)
                {
                    if (mats[m] == null || mats[m].shader == null) continue;
                    string shaderName = mats[m].shader.name;
                    bool ok = whitelist != null
                        ? whitelist.Contains(shaderName)
                        : shaderName.StartsWith("VRChat/Mobile/", StringComparison.Ordinal);
                    if (!ok) offenders.Add(shaderName);
                }
            }
            JArray offenderList = new JArray();
            int listed = 0;
            foreach (string name in offenders)
            {
                if (listed++ >= 20) break;
                offenderList.Add(name);
            }
            return new JObject
            {
                ["nonMobileShaderCount"] = offenders.Count,
                ["nonMobileShaders"] = offenderList,
                ["lights"] = avatar.GetComponentsInChildren<Light>(true).Length,
                ["cloth"] = avatar.GetComponentsInChildren<Cloth>(true).Length,
                ["cameras"] = avatar.GetComponentsInChildren<Camera>(true).Length,
                ["audioSources"] = avatar.GetComponentsInChildren<AudioSource>(true).Length,
                ["particleSystems"] = avatar.GetComponentsInChildren<ParticleSystem>(true).Length,
            };
        }

        private static HandlerUtil.ResolvedObject ResolveAvatar(string avatarPath)
        {
            // F-13: scene path first (unchanged), then prefab asset path.
            if (!string.IsNullOrEmpty(avatarPath))
            {
                return HandlerUtil.ResolveSceneOrPrefab(avatarPath);
            }
            HandlerUtil.ResolvedObject r = new HandlerUtil.ResolvedObject();
            List<GameObject> roots = HandlerUtil.GetAllSceneRoots();
            for (int i = 0; i < roots.Count; i++)
            {
                List<Component> found = HandlerUtil.ComponentsByTypeName(roots[i], "VRCAvatarDescriptor");
                if (found.Count > 0)
                {
                    r.Instance = found[0].gameObject;
                    return r;
                }
            }
            return r;
        }
#endif // MCP_VRCSDK3_AVATARS

        // ---- shared helpers -------------------------------------------------

        internal static Component FirstComponentByName(GameObject root, string shortName)
        {
            List<Component> found = HandlerUtil.ComponentsByTypeName(root, shortName);
            return found.Count > 0 ? found[0] : null;
        }

        internal static object CalculatePerformanceStats(GameObject avatar, bool mobile)
        {
            // Live SDK 3.10 signature (verified on-device 2026-08-05):
            //   CalculatePerformanceStats(string avatarName, GameObject avatarObject,
            //                             AvatarPerformanceStats perfStats, bool mobilePlatform)
            // The caller constructs the stats object and the method fills it.
            Type perf = HandlerUtil.FindType("VRC.SDKBase.Validation.Performance.AvatarPerformance");
            if (perf == null) return null;
            MethodInfo[] methods = perf.GetMethods(BindingFlags.Static | BindingFlags.Public);
            for (int i = 0; i < methods.Length; i++)
            {
                if (methods[i].Name != "CalculatePerformanceStats") continue;
                ParameterInfo[] prms = methods[i].GetParameters();
                if (prms.Length < 2 || prms[0].ParameterType != typeof(string) ||
                    prms[1].ParameterType != typeof(GameObject))
                {
                    continue;
                }
                object statsArg = null;
                object[] args = new object[prms.Length];
                args[0] = avatar.name;
                args[1] = avatar;
                bool usable = true;
                for (int j = 2; j < prms.Length && usable; j++)
                {
                    Type pt = prms[j].ParameterType;
                    if (pt == typeof(bool))
                    {
                        args[j] = mobile;
                    }
                    else if (pt.Name == "AvatarPerformanceStats")
                    {
                        statsArg = MakeStatsInstance(pt, mobile);
                        if (statsArg == null) { usable = false; break; }
                        args[j] = statsArg;
                    }
                    else
                    {
                        usable = false;
                    }
                }
                if (!usable) continue;
                try
                {
                    object ret = methods[i].Invoke(null, args);
                    // Fill-in-place overloads return void; the stats arg is the result.
                    return statsArg ?? ret;
                }
                catch { return null; }
            }
            return null;
        }

        private static object MakeStatsInstance(Type statsType, bool mobile)
        {
            try
            {
                ConstructorInfo boolCtor = statsType.GetConstructor(new[] { typeof(bool) });
                if (boolCtor != null) return boolCtor.Invoke(new object[] { mobile });
                ConstructorInfo defCtor = statsType.GetConstructor(Type.EmptyTypes);
                if (defCtor != null) return defCtor.Invoke(null);
            }
            catch { }
            return null;
        }

        internal static string ReadString(JObject p, string name)
        {
            JToken t = p != null ? p[name] : null;
            return t != null && t.Type != JTokenType.Null ? t.Value<string>() : null;
        }

        internal static string[] ReadStringArray(JObject p, string name)
        {
            JArray arr = (p != null ? p[name] : null) as JArray;
            if (arr == null) return null;
            List<string> result = new List<string>(arr.Count);
            for (int i = 0; i < arr.Count; i++)
            {
                if (arr[i] != null && arr[i].Type == JTokenType.String) result.Add(arr[i].Value<string>());
            }
            return result.ToArray();
        }
    }

    /// <summary>
    /// vrc.upload job: {target:"avatar"|"world", objectName?, blueprintId?,
    /// thumbnailPath?, dryRun?}. dryRun runs validation only. Real upload uses
    /// the modern builder API via reflection (flagged for TB-3 verification).
    /// </summary>
    internal sealed class VrcUploadExecutor : IJobExecutor
    {
        public string Method => "vrc.upload";

        private static readonly bool AvatarsSupported =
#if MCP_VRCSDK3_AVATARS
            true;
#else
            false;
#endif

        private static readonly bool WorldsSupported =
#if MCP_VRCSDK3_WORLDS
            true;
#else
            false;
#endif

        public async Task<object> Run(JobContext ctx)
        {
            string target = VrcHandlers.ReadString(ctx.Params, "target");
            if (target != "avatar" && target != "world")
            {
                throw new McpHandlerException(ErrorCodes.InvalidParams,
                    "vrc.upload: 'target' must be avatar|world");
            }
            if (target == "avatar" && !AvatarsSupported)
            {
                throw new McpHandlerException(ErrorCodes.MethodNotFound,
                    "vrc.upload: avatars SDK not present (MCP_VRCSDK3_AVATARS off)");
            }
            if (target == "world" && !WorldsSupported)
            {
                throw new McpHandlerException(ErrorCodes.MethodNotFound,
                    "vrc.upload: worlds SDK not present (MCP_VRCSDK3_WORLDS off)");
            }

            string objectName = VrcHandlers.ReadString(ctx.Params, "objectName");
            string blueprintId = VrcHandlers.ReadString(ctx.Params, "blueprintId");
            string thumbnailPath = VrcHandlers.ReadString(ctx.Params, "thumbnailPath");
            bool dryRun = ReadBool(ctx.Params, "dryRun", false);

            GameObject content = null;
            if (target == "avatar")
            {
                content = ResolveAvatarContent(objectName);
                if (content == null)
                {
                    throw new McpHandlerException(ErrorCodes.InvalidParams,
                        "vrc.upload: no avatar with a VRCAvatarDescriptor found" +
                        (objectName != null ? " at '" + objectName + "'" : " in loaded scenes"));
                }
            }

            if (dryRun)
            {
                ctx.Report(50, "running SDK validation (dryRun)", "validate");
                return target == "avatar" ? DryRunAvatar(content, thumbnailPath) : DryRunWorld(thumbnailPath);
            }

            // A real upload PUBLISHES content to VRChat. Require an explicit,
            // per-call confirmation so a misdirected AI call can never publish
            // by accident. (dryRun needs no confirm - it validates only.)
            if (!ReadBool(ctx.Params, "confirm", false))
            {
                throw new McpHandlerException(ErrorCodes.InvalidParams,
                    "vrc.upload: real upload publishes content to VRChat; pass confirm:true " +
                    "(or use dryRun:true to validate without publishing)");
            }

            // Read-only pre-check: refuse a call without a usable arm before
            // opening the SDK control panel or waiting for its builder. The
            // arm is consumed only in RealUpload (single consumer, see there).
            string armFile = McpUiModel.UploadArmPath;
            UploadArmClaim.ArmStatus arm = UploadArmClaim.Inspect(armFile, McpUiModel.UploadArmTtlMinutes);
            if (!arm.Usable) throw ArmRefusal(armFile, arm.Reason);

            return await RealUpload(ctx, target, content, objectName, blueprintId, thumbnailPath);
        }

        /// <summary>
        /// One arm = one real-upload attempt. Uses the arm file and TTL the
        /// Creator Console shows (McpUiModel: UNITY_MCP_ARM_FILE /
        /// UNITY_MCP_ARM_TTL_MIN from the Unity Editor's environment, read the
        /// same way as the server's armGate), then claims it exclusively via
        /// UploadArmClaim. Fail-safe: anything but a fresh arm claimed by this
        /// call throws.
        /// </summary>
        private static void ClaimArmOrThrow()
        {
            string file = McpUiModel.UploadArmPath;
            string state = UploadArmClaim.TryClaim(file, McpUiModel.UploadArmTtlMinutes);
            if (state != null) throw ArmRefusal(file, state);
        }

        private static McpHandlerException ArmRefusal(string file, string state)
        {
            string hint = "";
            if (state == UploadArmClaim.NotFound)
            {
                hint = " If the operator did arm it: another upload attempt may have used it " +
                    "after the server checked it, an MCP server older than this plugin may " +
                    "have consumed it before submitting the job (update the tunasync-unity-mcp " +
                    "server to this plugin's version), or UNITY_MCP_ARM_FILE differs between " +
                    "the server and the Unity Editor.";
            }
            return new McpHandlerException(ErrorCodes.InvalidParams,
                "vrc.upload: a real upload additionally requires the human-created one-shot " +
                "arm file (" + file + "; " + state + ")." + hint + " The operator arms it in " +
                "Creator Console (VRC upload safety gate) or with tools/arm-vrc-upload.bat. If " +
                "you are an AI agent: do NOT create this file yourself - stop and ask the " +
                "operator to arm, then retry.");
        }

        public bool CanResume(JobRecord record) => false;

        public Task<object> Resume(JobRecord record, JobContext ctx)
            => throw new NotSupportedException("vrc.upload does not resume");

        // ---- dry run --------------------------------------------------------

        private static object DryRunAvatar(GameObject avatar, string thumbnailPath)
        {
            List<JObject> issues = new List<JObject>();

            Component pipeline = VrcHandlers.FirstComponentByName(avatar, "PipelineManager");
            string blueprint = pipeline != null
                ? HandlerUtil.GetFieldOrProp(pipeline, "blueprintId") as string
                : null;
            if (pipeline == null)
            {
                Issue(issues, "error", "no PipelineManager on the avatar root");
            }
            else if (string.IsNullOrEmpty(blueprint))
            {
                Issue(issues, "warning", "PipelineManager.blueprintId empty (new content)");
                if (string.IsNullOrEmpty(thumbnailPath))
                {
                    Issue(issues, "error",
                        "thumbnailPath is required when creating a new VRChat avatar");
                }
            }

            CheckIllegalComponents(avatar, issues);
            CheckThumbnail(thumbnailPath, issues);

            string overall = null;
            try
            {
                object stats = VrcHandlers.CalculatePerformanceStats(avatar, false);
                if (stats != null)
                {
                    overall = OverallRatingOf(stats);
                    if (overall == "VeryPoor")
                    {
                        Issue(issues, "warning", "overall performance rating is VeryPoor");
                    }
                }
            }
            catch { }

            return FinishDryRun(issues, new JObject
            {
                ["blueprintId"] = blueprint,
                ["performanceOverall"] = overall,
            });
        }

        // Covers (F-18): SceneDescriptor / PipelineManager+blueprintId /
        // AudioListener count / spawns / ReferenceCamera / RespawnHeightY /
        // scriptCompilationFailed / BuildTarget / ColorSpace / thumbnail
        // existence, plus info counts (audioListeners, canvases,
        // eventSystems - a VRChat world normally has NO EventSystem; the
        // client supplies input, so absence is informational, never a
        // warning: live-checked against a published world with 73 Canvases
        // and 0 EventSystems). NOT covered (heavy or noisy): lightmap state,
        // layer table anomalies, InternalErrorShader scan.
        private static object DryRunWorld(string thumbnailPath)
        {
            List<JObject> issues = new List<JObject>();

            Component sceneDescriptor = FindSceneComponent("VRCSceneDescriptor");
            if (sceneDescriptor == null)
            {
                Issue(issues, "error", "no VRCSceneDescriptor in loaded scenes");
            }

            Component pipeline = FindSceneComponent("PipelineManager");
            string blueprint = pipeline != null
                ? HandlerUtil.GetFieldOrProp(pipeline, "blueprintId") as string
                : null;
            if (pipeline == null)
            {
                Issue(issues, "error", "no PipelineManager in loaded scenes");
            }
            else if (string.IsNullOrEmpty(blueprint))
            {
                Issue(issues, "warning", "PipelineManager.blueprintId empty (new world)");
            }

            List<GameObject> roots = HandlerUtil.GetAllSceneRoots();
            int listeners = 0;
            int canvases = 0;
            int eventSystems = 0;
            for (int i = 0; i < roots.Count; i++)
            {
                listeners += roots[i].GetComponentsInChildren<AudioListener>(true).Length;
                canvases += HandlerUtil.ComponentsByTypeName(roots[i], "Canvas").Count;
                eventSystems += HandlerUtil.ComponentsByTypeName(roots[i], "EventSystem").Count;
            }
            if (listeners > 1)
            {
                Issue(issues, "warning", "multiple AudioListeners (" + listeners + ")");
            }

            if (sceneDescriptor != null)
            {
                Array spawns = HandlerUtil.GetFieldOrProp(sceneDescriptor, "spawns") as Array;
                bool hasSpawn = false;
                if (spawns != null)
                {
                    foreach (object s in spawns)
                    {
                        Transform t = s as Transform;
                        if (t != null) { hasSpawn = true; break; }
                    }
                }
                if (!hasSpawn)
                {
                    Issue(issues, "warning",
                        "VRCSceneDescriptor.spawns has no spawn Transform (players spawn at descriptor origin)");
                }

                object refCam = HandlerUtil.GetFieldOrProp(sceneDescriptor, "ReferenceCamera");
                UnityEngine.Object refCamUo = refCam as UnityEngine.Object;
                // UnityEngine.Object's implicit bool handles destroyed fake-nulls.
                bool refCamSet = refCamUo != null ? (bool)refCamUo : refCam != null;
                if (!refCamSet)
                {
                    Issue(issues, "warning",
                        "VRCSceneDescriptor.ReferenceCamera not set (clipping planes / post fall back to defaults)");
                }

                object respawnY = HandlerUtil.GetFieldOrProp(sceneDescriptor, "RespawnHeightY");
                if (respawnY is float ry && ry >= 0f)
                {
                    Issue(issues, "warning",
                        "VRCSceneDescriptor.RespawnHeightY is " + ry +
                        " (>= 0; players below this height respawn - a floor at y=0 respawns instantly)");
                }
            }

            if (EditorUtility.scriptCompilationFailed)
            {
                Issue(issues, "error", "script compilation failed (fix console errors before uploading)");
            }

            BuildTarget bt = EditorUserBuildSettings.activeBuildTarget;
            if (bt != BuildTarget.StandaloneWindows64 && bt != BuildTarget.Android && bt != BuildTarget.iOS)
            {
                Issue(issues, "warning", "activeBuildTarget is " + bt + " (VRChat targets Windows64/Android/iOS)");
            }

            if (PlayerSettings.colorSpace != ColorSpace.Linear)
            {
                Issue(issues, "warning",
                    "PlayerSettings.colorSpace is " + PlayerSettings.colorSpace + " (VRChat expects Linear)");
            }

            // 2.6.10: the SDK refuses to build a world until the VRChat layer
            // table and collision matrix are set up ("You must address Layers
            // and Collision Matrix issues"), so a dry run that skips this check
            // passes while the real upload fails after the arm is spent (seen on
            // a fresh template project, 2026-11-09). Read-only check via the
            // SDK's own UpdateLayers; skipped when that type is absent.
            Type updateLayers = HandlerUtil.FindType("UpdateLayers");
            if (updateLayers != null)
            {
                const BindingFlags lf = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static;
                object layersOk = null;
                object matrixOk = null;
                try
                {
                    layersOk = updateLayers.GetMethod("AreLayersSetup", lf, null, Type.EmptyTypes, null)?.Invoke(null, null);
                    matrixOk = updateLayers.GetMethod("IsCollisionLayerMatrixSetup", lf, null, Type.EmptyTypes, null)?.Invoke(null, null);
                }
                catch (Exception)
                {
                    // a diagnostics read must never break the dry run
                }
                if (layersOk is bool l && !l || matrixOk is bool m && !m)
                {
                    Issue(issues, "error",
                        "VRChat layers / collision matrix are not set up - the SDK will refuse to build " +
                        "(VRChat SDK control panel > Builder: 'Setup Layers for VRChat' and 'Set Collision Matrix')");
                }
            }

            CheckThumbnail(thumbnailPath, issues);

            return FinishDryRun(issues, new JObject
            {
                ["blueprintId"] = blueprint,
                ["audioListenerCount"] = listeners,
                ["canvasCount"] = canvases,
                ["eventSystemCount"] = eventSystems,
            });
        }

        private static void CheckIllegalComponents(GameObject go, List<JObject> issues)
        {
            try
            {
                Type validation = HandlerUtil.FindType("VRC.SDKBase.Validation.AvatarValidation");
                MethodInfo find = validation != null
                    ? validation.GetMethod("FindIllegalComponents",
                        BindingFlags.Static | BindingFlags.Public, null,
                        new[] { typeof(GameObject) }, null)
                    : null;
                if (find == null) return;
                IEnumerable illegal = find.Invoke(null, new object[] { go }) as IEnumerable;
                if (illegal == null) return;
                int count = 0;
                foreach (object component in illegal)
                {
                    count++;
                    if (count <= 10 && component != null)
                    {
                        Issue(issues, "error", "illegal component: " + component.GetType().Name);
                    }
                }
                if (count > 10)
                {
                    Issue(issues, "error", "illegal components total: " + count);
                }
            }
            catch { }
        }

        private static void CheckThumbnail(string thumbnailPath, List<JObject> issues)
        {
            if (!string.IsNullOrEmpty(thumbnailPath) && !File.Exists(thumbnailPath))
            {
                Issue(issues, "error", "thumbnailPath not found: " + thumbnailPath);
            }
        }

        private static object FinishDryRun(List<JObject> issues, JObject info)
        {
            bool valid = true;
            JArray arr = new JArray();
            for (int i = 0; i < issues.Count; i++)
            {
                arr.Add(issues[i]);
                if ((string)issues[i]["severity"] == "error") valid = false;
            }
            JObject result = new JObject
            {
                ["valid"] = valid,
                ["issues"] = arr,
                ["info"] = info,
            };
            return result;
        }

        private static void Issue(List<JObject> issues, string severity, string message)
        {
            issues.Add(new JObject { ["severity"] = severity, ["message"] = message });
        }

        private static string OverallRatingOf(object stats)
        {
            try
            {
                MethodInfo[] methods = stats.GetType().GetMethods(BindingFlags.Instance | BindingFlags.Public);
                for (int i = 0; i < methods.Length; i++)
                {
                    if (methods[i].Name != "GetPerformanceRatingForCategory") continue;
                    ParameterInfo[] prms = methods[i].GetParameters();
                    if (prms.Length != 1 || !prms[0].ParameterType.IsEnum) continue;
                    object overall = Enum.Parse(prms[0].ParameterType, "Overall");
                    object rating = methods[i].Invoke(stats, new[] { overall });
                    return rating != null ? rating.ToString() : null;
                }
            }
            catch { }
            return null;
        }

        // ---- real upload (reflection over the modern builder API) -----------

        private async Task<object> RealUpload(JobContext ctx, string target, GameObject content,
            string objectName, string blueprintId, string thumbnailPath)
        {
            try
            {
                // 1. The control panel must exist for builders to register.
                Type panelType = HandlerUtil.FindType("VRC.SDKBase.Editor.VRCSdkControlPanel")
                                 ?? HandlerUtil.FindType("VRCSdkControlPanel");
                if (panelType == null)
                {
                    throw new McpHandlerException(ErrorCodes.HandlerException,
                        "vrc.upload: VRCSdkControlPanel type not found (SDK version mismatch?)");
                }
                ctx.Report(5, "opening VRC SDK control panel", "panel");
                EditorWindow.GetWindow(panelType);

                // 2. Poll for the builder API (registers when the panel enables).
                string ifaceName = target == "avatar"
                    ? "VRC.SDK3A.Editor.IVRCSdkAvatarBuilderApi"
                    : "VRC.SDK3.Editor.IVRCSdkWorldBuilderApi";
                Type iface = HandlerUtil.FindType(ifaceName);
                if (iface == null)
                {
                    throw new McpHandlerException(ErrorCodes.HandlerException,
                        "vrc.upload: builder interface not found: " + ifaceName);
                }
                object builder = await PollForBuilder(panelType, iface, ctx);
                if (builder == null)
                {
                    throw new McpHandlerException(ErrorCodes.HandlerException,
                        "vrc.upload: builder unavailable; is the SDK control panel logged in?");
                }

                // 3. Content data struct (VRCAvatar / VRCWorld) and the
                // BuildAndUpload overload - lookups only, nothing changed yet.
                string dataTypeName = target == "avatar"
                    ? "VRC.SDKBase.Editor.Api.VRCAvatar"
                    : "VRC.SDKBase.Editor.Api.VRCWorld";
                Type dataType = HandlerUtil.FindType(dataTypeName);
                if (dataType == null)
                {
                    throw new McpHandlerException(ErrorCodes.HandlerException,
                        "vrc.upload: content data type not found: " + dataTypeName);
                }
                MethodInfo bau = PickBuildAndUpload(iface, dataType);
                if (bau == null)
                {
                    throw new McpHandlerException(ErrorCodes.HandlerException,
                        "vrc.upload: BuildAndUpload method not found on " + iface.Name);
                }
                // 4. SDK credentials, in memory only. APIUser.Login uses
                // BestHTTP while the modern VRCApi upload layer uses a separate
                // HttpClient populated from ApiCredentials. Some SDK login
                // paths leave the valid auth cookie only in BestHTTP's
                // CookieJar, making the UI appear logged in while
                // Create*Record fails with "Missing Credentials". Synchronize
                // those two SDK-owned stores before any remote metadata call.
                ctx.Report(7, "synchronizing SDK API credentials", "auth");
                EnsureUploadCredentials();

                // 5. Identity and metadata - remote reads only, nothing in the
                // project is changed yet.
                string requestedName = objectName ?? (content != null ? content.name : "Untitled");
                string effectiveBlueprintId = blueprintId;
                Component worldPipeline = null;
                string worldId = null;
                string worldUser = null;
                string avatarUser = null;
                object data;
                if (target == "world")
                {
                    // Private worlds only, fail closed: the scene's
                    // PipelineManager owns the identity (never reassigned), an
                    // existing world must belong to the signed-in SDK user and
                    // already be private, and visibility is never changed.
                    worldPipeline = FindSceneComponent("PipelineManager");
                    if (worldPipeline == null) throw WorldFailure("PipelineManager missing");
                    worldId = HandlerUtil.GetFieldOrProp(worldPipeline, "blueprintId") as string;
                    if (!string.IsNullOrEmpty(blueprintId) && blueprintId != worldId)
                        throw WorldFailure("requested blueprint differs from scene; no identity reassignment allowed");
                    worldUser = CurrentSdkUserId();
                    if (string.IsNullOrEmpty(worldUser)) throw WorldFailure("SDK user not logged in");
                    effectiveBlueprintId = worldId;
                    if (!string.IsNullOrWhiteSpace(worldId))
                    {
                        // Preserve fetched Name, Description, Tags, capacities,
                        // image/thumbnail and all other metadata, plus exact ID.
                        ctx.Report(8, "loading existing VRChat metadata", "metadata");
                        data = await LoadExistingContentData(dataType, target, worldId, ctx);
                        if ((HandlerUtil.GetFieldOrProp(data, "ID") as string) != worldId ||
                            (HandlerUtil.GetFieldOrProp(data, "AuthorId") as string) != worldUser)
                            throw WorldFailure("world identity or ownership mismatch");
                        if ((HandlerUtil.GetFieldOrProp(data, "ReleaseStatus") as string) != "private")
                            throw WorldFailure("existing world is not private; no visibility transition allowed");
                    }
                    else
                    {
                        data = NewPrivateWorldData(dataType, objectName, thumbnailPath);
                    }
                }
                else
                {
                    // An explicit ID may attach existing content; otherwise keep
                    // the ID already stored on the avatar's PipelineManager.
                    Component avatarPipeline = content != null
                        ? VrcHandlers.FirstComponentByName(content, "PipelineManager")
                        : null;
                    if (string.IsNullOrEmpty(effectiveBlueprintId) && avatarPipeline != null)
                    {
                        effectiveBlueprintId = HandlerUtil.GetFieldOrProp(avatarPipeline, "blueprintId") as string;
                    }
                    if (!string.IsNullOrEmpty(effectiveBlueprintId))
                    {
                        // Never synthesize empty metadata for an update: that
                        // could erase the remote description/tags or change
                        // visibility.
                        ctx.Report(8, "loading existing VRChat metadata", "metadata");
                        data = await LoadExistingContentData(dataType, target, effectiveBlueprintId, ctx);
                        // 2.6.10: same fail-closed rule as worlds - an existing
                        // avatar must belong to the signed-in SDK user and
                        // already be private. Publishing is a human decision,
                        // so a public avatar is never updated from here.
                        avatarUser = CurrentSdkUserId();
                        string refusal = ExistingContentRefusal(
                            effectiveBlueprintId,
                            HandlerUtil.GetFieldOrProp(data, "ID") as string,
                            HandlerUtil.GetFieldOrProp(data, "AuthorId") as string,
                            avatarUser,
                            HandlerUtil.GetFieldOrProp(data, "ReleaseStatus") as string);
                        if (refusal != null) throw AvatarFailure(refusal);
                    }
                    else
                    {
                        // The SDK's Create*Record endpoints require all four
                        // fields to be non-null. Match the SDK UI's safe
                        // new-content defaults and keep uploads private unless
                        // a human changes visibility later.
                        data = Activator.CreateInstance(dataType);
                        SetRequiredContentProperty(data, "Name", requestedName);
                        SetRequiredContentProperty(data, "Description", string.Empty);
                        SetRequiredContentProperty(data, "Tags", new List<string>());
                        SetRequiredContentProperty(data, "ReleaseStatus", "private");
                    }
                }
                ValidateRequiredContentMetadata(data);
                string name = HandlerUtil.GetFieldOrProp(data, "Name") as string ?? requestedName;
                object[] args = BuildArgs(bau, content, data, dataType, thumbnailPath, ctx);

                // 6. Re-verify after every awaited preparation step, before the
                // arm is spent: the scene identity and the signed-in SDK user
                // must not have changed underneath this job.
                if (target == "world" &&
                    ((HandlerUtil.GetFieldOrProp(worldPipeline, "blueprintId") as string) != worldId ||
                     CurrentSdkUserId() != worldUser))
                    throw WorldFailure("scene identity or SDK user changed during preparation");
                if (target == "avatar" && avatarUser != null && CurrentSdkUserId() != avatarUser)
                    throw AvatarFailure("SDK user changed during preparation");

                // 7. Human arm gate (M-1, 2026-08-12 audit): the plugin is the
                // SINGLE consumer of the arm, so a client that skips the npm
                // server still cannot publish through vrc.upload without it.
                // Claimed here - after the SDK builder, credentials, metadata
                // and the checks above are ready, before the first change
                // (blueprintId pin) and the build - so a failed preparation
                // (control panel not logged in, SDK types missing, metadata,
                // ownership or visibility refused) leaves the arm in place,
                // while every attempt that goes on to build uses it up (L-3:
                // one arm = one attempt, also across editors). Run refused
                // arm-less calls already (read-only); this claim is what
                // counts. The server only pre-checks the arm and submits real
                // uploads only to plugins that advertise "vrcUploadArmClaim".
                // (2.6.7-2.6.8 checked the arm in Run but left consuming it to
                // the server, which did so before submitting the job - so every
                // real upload was refused.)
                ClaimArmOrThrow();

                // 8. Pin blueprintId on the avatar's PipelineManager when
                // provided. Worlds never get a new identity (checked above).
                if (target == "avatar" && !string.IsNullOrEmpty(blueprintId))
                {
                    Component pipeline = content != null
                        ? VrcHandlers.FirstComponentByName(content, "PipelineManager")
                        : null;
                    if (pipeline != null &&
                        (HandlerUtil.TrySetField(pipeline, "blueprintId", blueprintId) ||
                         HandlerUtil.TrySetProp(pipeline, "blueprintId", blueprintId)))
                    {
                        EditorUtility.SetDirty(pipeline);
                    }
                }

                // 9. Phase markers via builder events (best effort). Once upload
                // starts we are past the point of no return.
                TryHookEvent(builder, iface, "OnSdkBuildStart",
                    () => ctx.Report(20, "building bundle", "build"));
                TryHookEvent(builder, iface, "OnSdkUploadStart",
                    () => ctx.Report(60, "uploading (point of no return)", "upload"));

                // 10. BuildAndUpload(...) with the arguments matched above.
                ctx.Report(10, "starting build+upload", "build");
                // 2.6.10: the control panel polls the blueprintId every second.
                // For new content it sees the fresh ID before GetWorld/GetAvatar
                // can find it, decides "we do not own this", clears the ID, and
                // the copyright step then fails with "Failed to agree" (seen
                // 2026-10-25). The panel's own Upload button disables the UI for
                // the duration; do the same and restore it afterwards.
                bool? uiWas = SetBuilderUiEnabled(builder, false);
                Task task;
                try
                {
                    object taskObj;
                    try
                    {
                        taskObj = bau.Invoke(builder, args);
                    }
                    catch (TargetInvocationException tie)
                    {
                        Exception inner = tie.InnerException ?? tie;
                        throw new McpHandlerException(ErrorCodes.HandlerException,
                            "vrc.upload: BuildAndUpload threw: " + inner.GetType().Name + ": " + inner.Message);
                    }
                    task = taskObj as Task;
                    if (task == null)
                    {
                        throw new McpHandlerException(ErrorCodes.HandlerException,
                            "vrc.upload: BuildAndUpload did not return a Task");
                    }
                    await task;
                }
                finally
                {
                    if (uiWas.HasValue) SetBuilderUiEnabled(builder, uiWas.Value);
                }

                object uploadResult = null;
                Type taskType = task.GetType();
                if (taskType.IsGenericType)
                {
                    PropertyInfo rp = taskType.GetProperty("Result");
                    if (rp != null) uploadResult = rp.GetValue(task, null);
                }
                object resultId = HandlerUtil.GetFieldOrProp(uploadResult, "ID");
                string finalId = resultId != null ? resultId.ToString() : effectiveBlueprintId;
                if (string.IsNullOrWhiteSpace(finalId))
                {
                    // New content: BuildAndUpload returns a plain Task, and the
                    // fresh ID is only on the PipelineManager the SDK assigned
                    // (2026-11-09: the result reported "" for a new avatar/world).
                    Component idSource = target == "world"
                        ? (worldPipeline ?? FindSceneComponent("PipelineManager"))
                        : (content != null ? VrcHandlers.FirstComponentByName(content, "PipelineManager") : null);
                    finalId = idSource != null
                        ? HandlerUtil.GetFieldOrProp(idSource, "blueprintId") as string
                        : null;
                }

                ctx.Report(100, "upload complete", "upload");
                JObject done = new JObject
                {
                    ["uploaded"] = true,
                    ["target"] = target,
                    ["name"] = name,
                    ["blueprintId"] = finalId ?? "",
                };
                if (string.IsNullOrWhiteSpace(effectiveBlueprintId))
                {
                    // New content: the SDK wrote the new ID into the scene /
                    // prefab in memory only. Saving is left to the user.
                    done["note"] = "new content: save the scene so the new blueprintId is kept for the next upload";
                }
                return done;
            }
            catch (OperationCanceledException)
            {
                throw; // job cancellation
            }
            catch (McpHandlerException)
            {
                throw;
            }
            catch (Exception ex)
            {
                throw new McpHandlerException(ErrorCodes.HandlerException,
                    "vrc.upload failed: " + ex.GetType().Name + ": " + ex.Message +
                    " (SDK control panel must be open and logged in; API surface may need adjustment)");
            }
        }

        private static McpHandlerException WorldFailure(string detail)
        {
            return new McpHandlerException(ErrorCodes.InvalidParams,
                "vrc.upload: fail-closed private world precondition: " + detail);
        }

        /// <summary>
        /// Set the SDK builder's UiEnabled (property or field) and return the
        /// previous value, or null when this SDK has no such member.
        /// </summary>
        private static bool? SetBuilderUiEnabled(object builder, bool value)
        {
            try
            {
                if (builder == null) return null;
                object prev = HandlerUtil.GetFieldOrProp(builder, "UiEnabled");
                if (!(prev is bool)) return null;
                if (HandlerUtil.TrySetProp(builder, "UiEnabled", value) ||
                    HandlerUtil.TrySetField(builder, "UiEnabled", value))
                {
                    return (bool)prev;
                }
                return null;
            }
            catch (Exception)
            {
                return null;
            }
        }

        private static McpHandlerException AvatarFailure(string detail)
        {
            return new McpHandlerException(ErrorCodes.InvalidParams,
                "vrc.upload: fail-closed private avatar precondition: " + detail);
        }

        /// <summary>
        /// Why updating existing content must be refused, or null when it may
        /// go ahead: the fetched record must be exactly the requested ID, owned
        /// by the signed-in SDK user, and already private. Anything unknown
        /// (no user, no author, no status) refuses.
        /// </summary>
        internal static string ExistingContentRefusal(
            string requestedId, string fetchedId, string authorId, string sdkUserId, string releaseStatus)
        {
            if (string.IsNullOrEmpty(sdkUserId)) return "SDK user not logged in";
            if (string.IsNullOrEmpty(requestedId) || fetchedId != requestedId)
                return "content identity mismatch";
            if (string.IsNullOrEmpty(authorId) || authorId != sdkUserId)
                return "content is not owned by the signed-in SDK user";
            if (releaseStatus != "private")
                return "existing content is not private; no update of public content allowed";
            return null;
        }

        private static string CurrentSdkUserId()
        {
            Type apiUser = HandlerUtil.FindType("VRC.Core.APIUser");
            PropertyInfo current = apiUser == null ? null : apiUser.GetProperty("CurrentUser",
                BindingFlags.Public | BindingFlags.Static | BindingFlags.FlattenHierarchy);
            object user = current == null ? null : current.GetValue(null, null);
            return user == null ? null : HandlerUtil.GetFieldOrProp(user, "id") as string;
        }

        private static object NewPrivateWorldData(Type dataType, string objectName, string thumbnailPath)
        {
            if (string.IsNullOrWhiteSpace(objectName))
                throw WorldFailure("new world requires an explicit name");
            if (string.IsNullOrEmpty(thumbnailPath) || !File.Exists(thumbnailPath))
                throw WorldFailure("new world requires an existing thumbnail");
            object data = Activator.CreateInstance(dataType);
            PropertyInfo release = dataType.GetProperty("ReleaseStatus");
            PropertyInfo worldName = dataType.GetProperty("Name");
            PropertyInfo capacity = dataType.GetProperty("Capacity");
            PropertyInfo recommended = dataType.GetProperty("RecommendedCapacity");
            PropertyInfo description = dataType.GetProperty("Description");
            PropertyInfo tags = dataType.GetProperty("Tags");
            if (release == null || !release.CanWrite || release.PropertyType != typeof(string) ||
                worldName == null || !worldName.CanWrite || worldName.PropertyType != typeof(string) ||
                capacity == null || !capacity.CanWrite || capacity.PropertyType != typeof(int) ||
                recommended == null || !recommended.CanWrite || recommended.PropertyType != typeof(int) ||
                description == null || !description.CanWrite || description.PropertyType != typeof(string) ||
                tags == null || !tags.CanWrite || tags.PropertyType != typeof(List<string>))
                throw WorldFailure("required private-world metadata properties unavailable");
            release.SetValue(data, "private", null);
            worldName.SetValue(data, objectName, null);
            // SDK 3.10.5's new-world UI defaults (builder lines 1529-30).
            // VRCApi.CreateNewWorld forwards capacities without clamping.
            capacity.SetValue(data, 32, null);
            recommended.SetValue(data, 16, null);
            description.SetValue(data, string.Empty, null);
            tags.SetValue(data, new List<string>(), null);
            if ((HandlerUtil.GetFieldOrProp(data, "ReleaseStatus") as string) != "private")
                throw WorldFailure("private metadata could not be established");
            object maxValue = HandlerUtil.GetFieldOrProp(data, "Capacity");
            object recommendedValue = HandlerUtil.GetFieldOrProp(data, "RecommendedCapacity");
            if (!(maxValue is int) || !(recommendedValue is int) ||
                (int)maxValue <= 0 || (int)recommendedValue <= 0 ||
                (int)recommendedValue > (int)maxValue)
                throw WorldFailure("new-world capacities could not be established");
            return data;
        }

        private static void EnsureUploadCredentials()
        {
            const BindingFlags flags = BindingFlags.Static | BindingFlags.Public |
                                       BindingFlags.NonPublic;
            Type credentialsType = HandlerUtil.FindType("VRC.Core.ApiCredentials");
            if (credentialsType == null)
            {
                throw new McpHandlerException(ErrorCodes.HandlerException,
                    "vrc.upload: SDK ApiCredentials type not found");
            }

            MethodInfo getAuth = credentialsType.GetMethod("GetAuthToken", flags);
            MethodInfo getTfa = credentialsType.GetMethod("GetTwoFactorAuthToken", flags);
            string authToken = getAuth != null ? getAuth.Invoke(null, null) as string : null;
            if (!string.IsNullOrEmpty(authToken)) return;

            Type cookieJarType = HandlerUtil.FindType("BestHTTP.Cookies.CookieJar");
            MethodInfo getAll = cookieJarType != null
                ? cookieJarType.GetMethod("GetAll", flags, null, Type.EmptyTypes, null)
                : null;
            IEnumerable cookies = getAll != null ? getAll.Invoke(null, null) as IEnumerable : null;
            string tfaToken = getTfa != null ? getTfa.Invoke(null, null) as string : null;
            if (cookies != null)
            {
                foreach (object cookie in cookies)
                {
                    if (cookie == null) continue;
                    string name = HandlerUtil.GetFieldOrProp(cookie, "Name") as string;
                    string value = HandlerUtil.GetFieldOrProp(cookie, "Value") as string;
                    string domain = HandlerUtil.GetFieldOrProp(cookie, "Domain") as string;
                    if (string.IsNullOrEmpty(value) || !IsVrchatApiCookieDomain(domain)) continue;
                    if (name == "auth") authToken = value;
                    else if (name == "twoFactorAuth" && string.IsNullOrEmpty(tfaToken)) tfaToken = value;
                }
            }

            if (string.IsNullOrEmpty(authToken))
            {
                throw new McpHandlerException(ErrorCodes.HandlerException,
                    "vrc.upload: SDK login is visible but no usable VRChat auth cookie is available; " +
                    "sign in again in the SDK Account panel before arming an upload");
            }

            Type apiUserType = HandlerUtil.FindType("VRC.Core.APIUser");
            PropertyInfo currentUserProperty = apiUserType != null
                ? apiUserType.GetProperty("CurrentUser", flags)
                : null;
            object currentUser = currentUserProperty != null
                ? currentUserProperty.GetValue(null, null)
                : null;
            string username = currentUser != null
                ? HandlerUtil.GetFieldOrProp(currentUser, "username") as string
                : null;
            string humanName = currentUser != null
                ? HandlerUtil.GetFieldOrProp(currentUser, "displayName") as string
                : null;
            if (string.IsNullOrEmpty(username)) username = "vrchat-user";
            if (string.IsNullOrEmpty(humanName)) humanName = username;

            Type[] signature = { typeof(string), typeof(string), typeof(string), typeof(string), typeof(string) };
            MethodInfo set = credentialsType.GetMethod("Set", flags, null, signature, null);
            if (set == null)
            {
                throw new McpHandlerException(ErrorCodes.HandlerException,
                    "vrc.upload: SDK ApiCredentials.Set signature not found");
            }
            set.Invoke(null, new object[]
            {
                humanName, username, "vrchat", authToken, tfaToken ?? string.Empty
            });

            string synchronized = getAuth != null ? getAuth.Invoke(null, null) as string : null;
            if (string.IsNullOrEmpty(synchronized))
            {
                throw new McpHandlerException(ErrorCodes.HandlerException,
                    "vrc.upload: SDK API credential synchronization failed");
            }
        }

        private static bool IsVrchatApiCookieDomain(string domain)
        {
            if (string.IsNullOrEmpty(domain)) return false;
            return string.Equals(domain.TrimStart('.'), "api.vrchat.cloud",
                StringComparison.OrdinalIgnoreCase);
        }

        private static void SetRequiredContentProperty(object data, string propertyName, object value)
        {
            if (!HandlerUtil.TrySetProp(data, propertyName, value) ||
                HandlerUtil.GetFieldOrProp(data, propertyName) == null)
            {
                throw new McpHandlerException(ErrorCodes.HandlerException,
                    "vrc.upload: SDK content data is missing writable property '" +
                    propertyName + "'");
            }
        }

        private static void ValidateRequiredContentMetadata(object data)
        {
            string[] required = { "Name", "Description", "Tags", "ReleaseStatus" };
            for (int i = 0; i < required.Length; i++)
            {
                if (HandlerUtil.GetFieldOrProp(data, required[i]) == null)
                {
                    throw new McpHandlerException(ErrorCodes.HandlerException,
                        "vrc.upload: SDK content metadata '" + required[i] +
                        "' is null; refusing an unsafe upload");
                }
            }
        }

        private static async Task<object> LoadExistingContentData(Type dataType, string target,
            string blueprintId, JobContext ctx)
        {
            Type apiType = HandlerUtil.FindType("VRC.SDKBase.Editor.Api.VRCApi");
            if (apiType == null)
            {
                throw new McpHandlerException(ErrorCodes.HandlerException,
                    "vrc.upload: VRCApi type not found while loading existing metadata");
            }

            string getterName = target == "avatar" ? "GetAvatar" : "GetWorld";
            MethodInfo getter = null;
            MethodInfo[] methods = apiType.GetMethods(BindingFlags.Static | BindingFlags.Public);
            for (int i = 0; i < methods.Length; i++)
            {
                Type returnType = methods[i].ReturnType;
                if (methods[i].Name == getterName && returnType.IsGenericType &&
                    returnType.GetGenericTypeDefinition() == typeof(Task<>) &&
                    returnType.GetGenericArguments()[0] == dataType)
                {
                    getter = methods[i];
                    break;
                }
            }
            if (getter == null)
            {
                throw new McpHandlerException(ErrorCodes.HandlerException,
                    "vrc.upload: VRCApi." + getterName + " method not found");
            }

            ParameterInfo[] prms = getter.GetParameters();
            object[] args = new object[prms.Length];
            for (int i = 0; i < prms.Length; i++)
            {
                Type pt = prms[i].ParameterType;
                if (pt == typeof(string)) args[i] = blueprintId;
                else if (pt == typeof(bool)) args[i] = true;
                else if (pt == typeof(System.Threading.CancellationToken)) args[i] = ctx.Token;
                else if (prms[i].HasDefaultValue) args[i] = prms[i].DefaultValue;
                else
                {
                    throw new McpHandlerException(ErrorCodes.HandlerException,
                        "vrc.upload: unsupported parameter on VRCApi." + getterName +
                        ": " + prms[i].Name);
                }
            }

            object taskObject;
            try
            {
                taskObject = getter.Invoke(null, args);
            }
            catch (TargetInvocationException tie)
            {
                Exception inner = tie.InnerException ?? tie;
                throw new McpHandlerException(ErrorCodes.HandlerException,
                    "vrc.upload: could not load existing metadata: " + inner.Message);
            }
            Task task = taskObject as Task;
            if (task == null)
            {
                throw new McpHandlerException(ErrorCodes.HandlerException,
                    "vrc.upload: VRCApi." + getterName + " did not return a Task");
            }
            await task;

            PropertyInfo resultProperty = task.GetType().GetProperty("Result",
                BindingFlags.Instance | BindingFlags.Public);
            object result = resultProperty != null ? resultProperty.GetValue(task, null) : null;
            if (result == null)
            {
                throw new McpHandlerException(ErrorCodes.HandlerException,
                    "vrc.upload: VRCApi." + getterName + " returned no metadata");
            }
            return result;
        }

        private static async Task<object> PollForBuilder(Type panelType, Type iface, JobContext ctx)
        {
            MethodInfo generic = null;
            MethodInfo[] methods = panelType.GetMethods(BindingFlags.Static | BindingFlags.Public);
            for (int i = 0; i < methods.Length; i++)
            {
                if (methods[i].Name == "TryGetBuilder" && methods[i].IsGenericMethodDefinition &&
                    methods[i].GetParameters().Length == 1)
                {
                    generic = methods[i];
                    break;
                }
            }
            if (generic == null) return null;
            MethodInfo tryGet = generic.MakeGenericMethod(iface);

            for (int attempt = 0; attempt < 20; attempt++)
            {
                object[] args = new object[] { null };
                bool ok = false;
                try { ok = (bool)tryGet.Invoke(null, args); }
                catch { }
                if (ok && args[0] != null) return args[0];
                ctx.Report(null, "waiting for SDK builder (" + (attempt + 1) + "/20)", "panel");
                await Task.Delay(500, ctx.Token);
            }
            return null;
        }

        private static MethodInfo PickBuildAndUpload(Type iface, Type dataType)
        {
            MethodInfo[] methods = iface.GetMethods();
            MethodInfo fallback = null;
            for (int i = 0; i < methods.Length; i++)
            {
                if (methods[i].Name != "BuildAndUpload") continue;
                if (fallback == null) fallback = methods[i];
                ParameterInfo[] prms = methods[i].GetParameters();
                for (int j = 0; j < prms.Length; j++)
                {
                    if (prms[j].ParameterType == dataType) return methods[i];
                }
            }
            return fallback;
        }

        private static object[] BuildArgs(MethodInfo method, GameObject content, object data,
            Type dataType, string thumbnailPath, JobContext ctx)
        {
            ParameterInfo[] prms = method.GetParameters();
            object[] args = new object[prms.Length];
            bool thumbnailUsed = false;
            for (int i = 0; i < prms.Length; i++)
            {
                Type pt = prms[i].ParameterType;
                if (pt == typeof(GameObject)) args[i] = content;
                else if (pt == dataType) args[i] = data;
                else if (pt == typeof(string) && !thumbnailUsed)
                {
                    args[i] = thumbnailPath;
                    thumbnailUsed = true;
                }
                else if (pt == typeof(System.Threading.CancellationToken)) args[i] = ctx.Token;
                else if (prms[i].HasDefaultValue) args[i] = prms[i].DefaultValue;
                else args[i] = pt.IsValueType ? Activator.CreateInstance(pt) : null;
            }
            return args;
        }

        private static void TryHookEvent(object builder, Type iface, string eventName, Action callback)
        {
            try
            {
                EventInfo ev = builder.GetType().GetEvent(eventName);
                if (ev == null && iface != null) ev = iface.GetEvent(eventName);
                if (ev == null || ev.EventHandlerType == null) return;
                MethodInfo invoke = ev.EventHandlerType.GetMethod("Invoke");
                if (invoke == null || invoke.ReturnType != typeof(void)) return;
                ParameterInfo[] prms = invoke.GetParameters();
                ParameterExpression[] pes = new ParameterExpression[prms.Length];
                for (int i = 0; i < prms.Length; i++)
                {
                    pes[i] = Expression.Parameter(prms[i].ParameterType, "p" + i);
                }
                Expression body = Expression.Invoke(Expression.Constant(callback));
                LambdaExpression lambda = Expression.Lambda(ev.EventHandlerType, body, pes);
                ev.AddEventHandler(builder, lambda.Compile());
            }
            catch { }
        }

        // ---- shared lookups -------------------------------------------------

        private static GameObject ResolveAvatarContent(string objectName)
        {
            if (!string.IsNullOrEmpty(objectName))
            {
                GameObject go = HandlerUtil.FindSceneObjectByPath(objectName);
                if (go != null && VrcHandlers.FirstComponentByName(go, "VRCAvatarDescriptor") != null)
                {
                    return go;
                }
                return null;
            }
            List<GameObject> roots = HandlerUtil.GetAllSceneRoots();
            for (int i = 0; i < roots.Count; i++)
            {
                List<Component> found = HandlerUtil.ComponentsByTypeName(roots[i], "VRCAvatarDescriptor");
                if (found.Count > 0) return found[0].gameObject;
            }
            return null;
        }

        private static Component FindSceneComponent(string shortName)
        {
            List<GameObject> roots = HandlerUtil.GetAllSceneRoots();
            for (int i = 0; i < roots.Count; i++)
            {
                List<Component> found = HandlerUtil.ComponentsByTypeName(roots[i], shortName);
                if (found.Count > 0) return found[0];
            }
            return null;
        }

        private static bool ReadBool(JObject p, string name, bool fallback)
        {
            JToken t = p != null ? p[name] : null;
            if (t == null || t.Type == JTokenType.Null) return fallback;
            try { return t.Value<bool>(); }
            catch { return fallback; }
        }
    }
}
#endif // MCP_VRCSDK3_AVATARS || MCP_VRCSDK3_WORLDS
