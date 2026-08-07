---
name: asset_batch_import_f_b_x
old_tool: asset_batch_import_f_b_x
request_type: assetBatchImportFBX
description: "Phase 13 / asset / AssetBatchImportFBX"
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
    string folder = argd?.TryGetValue("folder", out var f) == true ? f?.ToString() : null;
    if (string.IsNullOrEmpty(folder)) { return new { success = false, error = "folder required" };  }
    var guids = AssetDatabase.FindAssets("t:Model", new[] { folder });
    int reimported = 0;
    foreach (var g in guids)
    {
        var path = AssetDatabase.GUIDToAssetPath(g);
        if (!path.EndsWith(".fbx", StringComparison.OrdinalIgnoreCase)) continue;
        AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);
        reimported++;
    }
    return new { success = true, folder, reimported };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
