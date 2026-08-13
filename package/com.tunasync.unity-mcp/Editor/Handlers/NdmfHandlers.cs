// ndmf.bake job executor. Entire file is compile-gated on MCP_NDMF
// (versionDefines: nadena.dev.ndmf present). NDMF is accessed via reflection
// (legacy BakeHandler pattern: nadena.dev.ndmf.AvatarProcessor,
// ProcessAvatar/ManualBakeAvatar(GameObject)) so the asmdef reference list
// stays empty. Unlike the legacy handler this runs inline in the job (no
// delayCall fire-and-forget): clone -> process -> save as prefab.
#if MCP_NDMF
using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace TunaSync.UnityMCP.Editor
{
    internal static class NdmfHandlers
    {
        public static void RegisterAll()
        {
            JobManager.RegisterExecutor(new NdmfBakeExecutor());
        }
    }

    internal sealed class NdmfBakeExecutor : IJobExecutor
    {
        public string Method => "ndmf.bake";

        public Task<object> Run(JobContext ctx)
        {
            string avatarPath = ReadString(ctx.Params, "avatarPath");
            if (string.IsNullOrEmpty(avatarPath))
            {
                throw new McpHandlerException(ErrorCodes.InvalidParams, "ndmf.bake: 'avatarPath' is required");
            }
            string outputDir = ReadString(ctx.Params, "outputDir");

            // Resolve the NDMF entry point first (fail fast).
            MethodInfo process = FindProcessMethod();
            if (process == null)
            {
                throw new McpHandlerException(ErrorCodes.HandlerException,
                    "NDMF AvatarProcessor.ProcessAvatar/ManualBakeAvatar(GameObject) not found");
            }

            // Resolve the source avatar: scene hierarchy path first, then asset path.
            GameObject source = HandlerUtil.FindSceneObjectByPath(avatarPath);
            GameObject clone;
            string baseName;
            if (source != null)
            {
                baseName = source.name;
                ctx.Report(5, "cloning scene avatar '" + baseName + "'", "clone");
                clone = UnityEngine.Object.Instantiate(source);
            }
            else if (avatarPath.StartsWith("Assets/", StringComparison.Ordinal))
            {
                GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(avatarPath);
                if (prefab == null)
                {
                    throw new McpHandlerException(ErrorCodes.InvalidParams,
                        "ndmf.bake: no GameObject at asset path '" + avatarPath + "'");
                }
                baseName = prefab.name;
                ctx.Report(5, "instantiating prefab '" + baseName + "'", "clone");
                clone = UnityEngine.Object.Instantiate(prefab);
            }
            else
            {
                throw new McpHandlerException(ErrorCodes.InvalidParams,
                    "ndmf.bake: avatar not found at scene path or asset path '" + avatarPath + "'");
            }

            string sanitizedBase = SanitizeName(baseName);
            clone.name = sanitizedBase + "_baked";

            try
            {
                // Long synchronous main-thread call by design (real bakes are heavy;
                // ping/sys.status stay answerable on the transport thread).
                ctx.Report(25, "running NDMF processing", "process");
                process.Invoke(null, new object[] { clone });

                ctx.Report(75, "saving baked prefab", "save");
                if (string.IsNullOrEmpty(outputDir))
                {
                    outputDir = "Assets/UnityMCP_Bakes/" + sanitizedBase + "_" +
                                DateTime.UtcNow.ToString("yyyyMMdd_HHmmss");
                }
                outputDir = outputDir.Replace('\\', '/').TrimEnd('/');
                // L-17 (audit): an unvalidated outputDir could create
                // directories anywhere on disk. Bakes are assets; the
                // destination must stay inside Assets/ with no traversal.
                if (!outputDir.StartsWith("Assets/", StringComparison.OrdinalIgnoreCase)
                    || outputDir.Contains(".."))
                {
                    throw new McpHandlerException(ErrorCodes.InvalidParams,
                        "ndmf.bake: outputDir must be a project-relative path under Assets/ " +
                        "without '..' (got '" + outputDir + "')");
                }
                EnsureAssetFolder(outputDir);

                string prefabPath = AssetDatabase.GenerateUniqueAssetPath(
                    outputDir + "/" + clone.name + ".prefab");
                GameObject saved = PrefabUtility.SaveAsPrefabAsset(clone, prefabPath);
                if (saved == null)
                {
                    throw new McpHandlerException(ErrorCodes.HandlerException,
                        "ndmf.bake: SaveAsPrefabAsset failed for '" + prefabPath + "'");
                }
                AssetDatabase.SaveAssets();

                int gameObjects = clone.GetComponentsInChildren<Transform>(true).Length;
                int meshes = CountUniqueMeshes(clone);

                ctx.Report(100, "done", "save");
                return Task.FromResult<object>(new
                {
                    outputPrefabPath = prefabPath,
                    stats = new { gameObjects, meshes },
                });
            }
            catch (TargetInvocationException tie)
            {
                Exception inner = tie.InnerException ?? tie;
                throw new McpHandlerException(ErrorCodes.HandlerException,
                    "NDMF processing failed: " + inner.GetType().Name + ": " + inner.Message);
            }
            finally
            {
                if (clone != null) UnityEngine.Object.DestroyImmediate(clone);
            }
        }

        public bool CanResume(JobRecord record) => false;

        public Task<object> Resume(JobRecord record, JobContext ctx)
            => throw new NotSupportedException("ndmf.bake does not resume");

        // ---- internals ------------------------------------------------------

        private static MethodInfo FindProcessMethod()
        {
            Type processor = HandlerUtil.FindType("nadena.dev.ndmf.AvatarProcessor");
            if (processor == null) return null;
            MethodInfo[] methods = processor.GetMethods(BindingFlags.Public | BindingFlags.Static);
            // Prefer ProcessAvatar; ManualBakeAvatar is the menu-facing variant.
            for (int pass = 0; pass < 2; pass++)
            {
                string name = pass == 0 ? "ProcessAvatar" : "ManualBakeAvatar";
                for (int i = 0; i < methods.Length; i++)
                {
                    if (methods[i].Name != name) continue;
                    ParameterInfo[] prms = methods[i].GetParameters();
                    if (prms.Length == 1 && prms[0].ParameterType == typeof(GameObject))
                    {
                        return methods[i];
                    }
                }
            }
            return null;
        }

        private static void EnsureAssetFolder(string assetDir)
        {
            if (AssetDatabase.IsValidFolder(assetDir)) return;
            string full = Path.Combine(McpEditorInfo.ProjectPath, assetDir);
            Directory.CreateDirectory(full);
            AssetDatabase.Refresh();
        }

        private static int CountUniqueMeshes(GameObject root)
        {
            HashSet<Mesh> meshes = new HashSet<Mesh>();
            SkinnedMeshRenderer[] skinned = root.GetComponentsInChildren<SkinnedMeshRenderer>(true);
            for (int i = 0; i < skinned.Length; i++)
            {
                if (skinned[i].sharedMesh != null) meshes.Add(skinned[i].sharedMesh);
            }
            MeshFilter[] filters = root.GetComponentsInChildren<MeshFilter>(true);
            for (int i = 0; i < filters.Length; i++)
            {
                if (filters[i].sharedMesh != null) meshes.Add(filters[i].sharedMesh);
            }
            return meshes.Count;
        }

        private static string SanitizeName(string name)
        {
            if (string.IsNullOrEmpty(name)) return "avatar";
            char[] invalid = Path.GetInvalidFileNameChars();
            char[] chars = name.ToCharArray();
            for (int i = 0; i < chars.Length; i++)
            {
                for (int j = 0; j < invalid.Length; j++)
                {
                    if (chars[i] == invalid[j])
                    {
                        chars[i] = '_';
                        break;
                    }
                }
            }
            return new string(chars);
        }

        private static string ReadString(JObject p, string name)
        {
            JToken t = p != null ? p[name] : null;
            return t != null && t.Type != JTokenType.Null ? t.Value<string>() : null;
        }
    }
}
#endif
