---
name: asset_bulk_rename_asset
old_tool: asset_bulk_rename_asset
request_type: assetBulkRenameAsset
description: "Phase 13 / asset / AssetBulkRenameAsset"
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
    string findText = argd?.TryGetValue("find", out var fd) == true ? fd?.ToString() : null;
    string replaceText = argd?.TryGetValue("replace", out var rp) == true ? rp?.ToString() : "";
    if (string.IsNullOrEmpty(folder) || string.IsNullOrEmpty(findText)) { return new { success = false, error = "folder + find required" };  }

    var guids = AssetDatabase.FindAssets("", new[] { folder });
    int renamed = 0;
    foreach (var g in guids)
    {
        var path = AssetDatabase.GUIDToAssetPath(g);
        var fileName = Path.GetFileNameWithoutExtension(path);
        if (!fileName.Contains(findText)) continue;
        var newName = fileName.Replace(findText, replaceText);
        var err = AssetDatabase.RenameAsset(path, newName);
        if (string.IsNullOrEmpty(err)) renamed++;
    }
    AssetDatabase.SaveAssets();
    return new { success = true, folder, find = findText, replace = replaceText, renamed };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
