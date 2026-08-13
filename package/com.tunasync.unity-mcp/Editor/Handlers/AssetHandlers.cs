// asset.importPackage (P2-1): first-class .unitypackage import.
// BOOTH assets arrive as .unitypackage and are the entry point of avatar
// work; interactive is always false (no import dialog - this is an
// automation surface). New/changed asset paths are captured by an
// AssetPostprocessor collector scoped to the import window.
// A package that contains scripts triggers a compile + domain reload: the
// in-flight request then answers DOMAIN_RELOAD (retryable) while the import
// itself completes - verify afterwards instead of re-importing blindly.
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;

namespace TunaSync.UnityMCP.Editor
{
    internal static class AssetHandlers
    {
        public static void RegisterAll()
        {
            Dispatcher.RegisterMethod("asset.importPackage", true, ImportPackage);
        }

        private static Task<object> ImportPackage(JObject p, RequestContext ctx)
        {
            JToken pathTok = p != null ? p["path"] : null;
            string file = pathTok != null && pathTok.Type != JTokenType.Null
                ? pathTok.Value<string>()
                : null;
            if (string.IsNullOrEmpty(file))
            {
                throw new McpHandlerException(ErrorCodes.InvalidParams,
                    "asset.importPackage: 'path' is required");
            }
            string full = Path.GetFullPath(file);
            if (!File.Exists(full))
            {
                throw new McpHandlerException(ErrorCodes.InvalidParams,
                    "asset.importPackage: file not found: " + full);
            }
            if (!full.EndsWith(".unitypackage", StringComparison.OrdinalIgnoreCase))
            {
                throw new McpHandlerException(ErrorCodes.InvalidParams,
                    "asset.importPackage: not a .unitypackage: " + full);
            }

            TaskCompletionSource<object> tcs = new TaskCompletionSource<object>();
            AssetImportCollector.Begin();
            AssetDatabase.ImportPackageCallback completed = null;
            AssetDatabase.ImportPackageFailedCallback failed = null;
            completed = (packageName) =>
            {
                AssetDatabase.importPackageCompleted -= completed;
                AssetDatabase.importPackageFailed -= failed;
                List<string> assets = AssetImportCollector.End();
                tcs.TrySetResult(new
                {
                    imported = true,
                    package = packageName,
                    // `package` is Unity's callback value (name without the
                    // extension); echo what the caller actually passed so the
                    // answer can be matched to the request.
                    packagePath = full,
                    assetCount = assets.Count,
                    assets,
                    // Two ways this list misleads, both named rather than fixed:
                    // 0 read identically to "empty package" / "failed", and the
                    // collector is a global AssetPostprocessor - anything Unity
                    // imported during the window lands here, package or not.
                    note = assets.Count == 0
                        ? "no assets were imported or changed: the package content already matches the project (Unity skips identical assets). This is success, not an empty or failed package."
                        : "assets[] lists everything Unity imported while this package was importing - a busy editor can add unrelated entries (e.g. ProjectSettings after a domain reload); it is not a manifest of the package.",
                });
            };
            failed = (packageName, error) =>
            {
                AssetDatabase.importPackageCompleted -= completed;
                AssetDatabase.importPackageFailed -= failed;
                AssetImportCollector.End();
                tcs.TrySetException(new McpHandlerException(ErrorCodes.HandlerException,
                    "asset.importPackage failed for '" + packageName + "': " + error));
            };
            AssetDatabase.importPackageCompleted += completed;
            AssetDatabase.importPackageFailed += failed;
            try
            {
                AssetDatabase.ImportPackage(full, false);
            }
            catch (Exception)
            {
                // L-23 (audit): a synchronous throw here used to leave both
                // callbacks subscribed forever (and the collector open).
                AssetDatabase.importPackageCompleted -= completed;
                AssetDatabase.importPackageFailed -= failed;
                AssetImportCollector.End();
                throw;
            }
            return tcs.Task;
        }
    }

    /// <summary>Collects imported asset paths while an import window is open.</summary>
    internal sealed class AssetImportCollector : AssetPostprocessor
    {
        private static List<string> _collecting;

        internal static void Begin()
        {
            _collecting = new List<string>();
        }

        internal static List<string> End()
        {
            List<string> got = _collecting != null ? _collecting : new List<string>();
            _collecting = null;
            return got;
        }

        private static void OnPostprocessAllAssets(
            string[] importedAssets, string[] deletedAssets,
            string[] movedAssets, string[] movedFromAssetPaths)
        {
            if (_collecting == null) return;
            _collecting.AddRange(importedAssets);
        }
    }
}
