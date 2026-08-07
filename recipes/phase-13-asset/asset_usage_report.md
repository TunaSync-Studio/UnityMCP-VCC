---
name: asset_usage_report
old_tool: asset_usage_report
request_type: assetUsageReport
description: "Phase 13 / asset / AssetUsageReport"
category: phase-13-asset
tags: [unity, phase13]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations, UnityEngine.UI
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string assetPath = argd?.TryGetValue("assetPath", out var ap) == true ? ap?.ToString() : null;
    if (string.IsNullOrEmpty(assetPath)) { return new { success = false, error = "assetPath required" };  }

    var usedBy = new List<string>();
    var allAssets = AssetDatabase.GetAllAssetPaths().Where(p => p.StartsWith("Assets/")).Take(20000);
    foreach (var p in allAssets)
    {
        if (p == assetPath) continue;
        var deps = AssetDatabase.GetDependencies(p, false);
        if (deps.Contains(assetPath)) usedBy.Add(p);
    }
    return new { success = true, assetPath, usedByCount = usedBy.Count, usedBy = usedBy.Take(100).ToList() };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
