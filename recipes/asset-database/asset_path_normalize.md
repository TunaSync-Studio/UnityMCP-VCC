---
name: asset_path_normalize
old_tool: asset_path_normalize
request_type: assetPathNormalize
description: "Raw asset path (any format)"
category: asset-database
tags: [unity, asset, path, normalize]
params:
  - {name: path, type: string, required: true, desc: "Raw asset path (any format)"}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, UnityEditor.SceneManagement
// --- injected helper shims (from AssetHandler.cs) ---
string NormalizeAssetPath(string input) {
            if (string.IsNullOrEmpty(input)) return input;
            string s = input.Replace("\\", "/").TrimStart('/');
            // collapse repeated slashes
            while (s.Contains("//")) s = s.Replace("//", "/");
            // strip leading absolute Application.dataPath
            string dp = Application.dataPath.Replace("\\", "/");
            if (s.StartsWith(dp, StringComparison.OrdinalIgnoreCase))
            {
                s = "Assets" + s.Substring(dp.Length);
            }
            // collapse "Assets/Assets/..." 二重以上
            while (s.StartsWith("Assets/Assets/", StringComparison.OrdinalIgnoreCase))
            {
                s = s.Substring("Assets/".Length);
            }
            // ensure starts with Assets/
            if (!s.StartsWith("Assets/", StringComparison.OrdinalIgnoreCase) && !s.Equals("Assets", StringComparison.OrdinalIgnoreCase))
            {
                s = "Assets/" + s;
            }
            return s;
        }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    if (argd == null || !argd.TryGetValue("path", out var p) || p == null)
    {
        return new { success = false, error = "path arg required" };

    }
    string input = p.ToString();
    string normalized = NormalizeAssetPath(input);
    bool exists = AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(normalized) != null;

    return new
    {
        success = true,
        input,
        normalized,
        changed = input != normalized,
        exists
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
