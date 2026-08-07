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
            GameObject avatar = ResolveAvatar(avatarPath);
            if (avatar == null)
            {
                throw new McpHandlerException(ErrorCodes.InvalidParams,
                    "vrc.avatarAudit: no avatar found (no VRCAvatarDescriptor in loaded scenes" +
                    (avatarPath != null ? ", and no object at '" + avatarPath + "'" : "") + ")");
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
                        case "performance": byCheck[check] = CheckPerformance(avatar); break;
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

        private static JToken CheckPerformance(GameObject avatar)
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
            return o;
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

        private static GameObject ResolveAvatar(string avatarPath)
        {
            if (!string.IsNullOrEmpty(avatarPath))
            {
                return HandlerUtil.FindSceneObjectByPath(avatarPath);
            }
            List<GameObject> roots = HandlerUtil.GetAllSceneRoots();
            for (int i = 0; i < roots.Count; i++)
            {
                List<Component> found = HandlerUtil.ComponentsByTypeName(roots[i], "VRCAvatarDescriptor");
                if (found.Count > 0) return found[0].gameObject;
            }
            return null;
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

            return await RealUpload(ctx, target, content, objectName, blueprintId, thumbnailPath);
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

                // 3. Pin blueprintId on the PipelineManager when provided.
                if (!string.IsNullOrEmpty(blueprintId))
                {
                    Component pipeline = target == "avatar" && content != null
                        ? VrcHandlers.FirstComponentByName(content, "PipelineManager")
                        : FindSceneComponent("PipelineManager");
                    if (pipeline != null &&
                        (HandlerUtil.TrySetField(pipeline, "blueprintId", blueprintId) ||
                         HandlerUtil.TrySetProp(pipeline, "blueprintId", blueprintId)))
                    {
                        EditorUtility.SetDirty(pipeline);
                    }
                }

                // 4. Content data struct (VRCAvatar / VRCWorld).
                string dataTypeName = target == "avatar"
                    ? "VRC.SDKBase.Editor.Api.VRCAvatar"
                    : "VRC.SDKBase.Editor.Api.VRCWorld";
                Type dataType = HandlerUtil.FindType(dataTypeName);
                if (dataType == null)
                {
                    throw new McpHandlerException(ErrorCodes.HandlerException,
                        "vrc.upload: content data type not found: " + dataTypeName);
                }
                object data = Activator.CreateInstance(dataType);
                string name = objectName ?? (content != null ? content.name : "Untitled");
                HandlerUtil.TrySetProp(data, "Name", name);
                if (!string.IsNullOrEmpty(blueprintId)) HandlerUtil.TrySetProp(data, "ID", blueprintId);

                // 5. Phase markers via builder events (best effort). Once upload
                // starts we are past the point of no return.
                TryHookEvent(builder, iface, "OnSdkBuildStart",
                    () => ctx.Report(20, "building bundle", "build"));
                TryHookEvent(builder, iface, "OnSdkUploadStart",
                    () => ctx.Report(60, "uploading (point of no return)", "upload"));

                // 6. BuildAndUpload(...) - match args by parameter type.
                MethodInfo bau = PickBuildAndUpload(iface, dataType);
                if (bau == null)
                {
                    throw new McpHandlerException(ErrorCodes.HandlerException,
                        "vrc.upload: BuildAndUpload method not found on " + iface.Name);
                }
                object[] args = BuildArgs(bau, content, data, dataType, thumbnailPath, ctx);

                ctx.Report(10, "starting build+upload", "build");
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
                Task task = taskObj as Task;
                if (task == null)
                {
                    throw new McpHandlerException(ErrorCodes.HandlerException,
                        "vrc.upload: BuildAndUpload did not return a Task");
                }
                await task;

                object uploadResult = null;
                Type taskType = task.GetType();
                if (taskType.IsGenericType)
                {
                    PropertyInfo rp = taskType.GetProperty("Result");
                    if (rp != null) uploadResult = rp.GetValue(task, null);
                }
                object resultId = HandlerUtil.GetFieldOrProp(uploadResult, "ID");

                ctx.Report(100, "upload complete", "upload");
                return new JObject
                {
                    ["uploaded"] = true,
                    ["target"] = target,
                    ["name"] = name,
                    ["blueprintId"] = resultId != null ? resultId.ToString() : blueprintId,
                };
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
