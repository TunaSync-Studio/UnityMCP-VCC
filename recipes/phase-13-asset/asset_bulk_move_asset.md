---
name: asset_bulk_move_asset
old_tool: asset_bulk_move_asset
request_type: assetBulkMoveAsset
description: "Phase 13 / asset / AssetBulkMoveAsset"
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
    string fromFolder = argd?.TryGetValue("fromFolder", out var ff) == true ? ff?.ToString() : null;
    string toFolder = argd?.TryGetValue("toFolder", out var tf) == true ? tf?.ToString() : null;
    string filter = argd?.TryGetValue("filter", out var fl) == true ? fl?.ToString() : "";
    if (string.IsNullOrEmpty(fromFolder) || string.IsNullOrEmpty(toFolder)) { return new { success = false, error = "fromFolder + toFolder required" };  }

    if (!AssetDatabase.IsValidFolder(toFolder))
    {
        var parent = Path.GetDirectoryName(toFolder).Replace("\\", "/");
        var folderName = Path.GetFileName(toFolder);
        if (AssetDatabase.IsValidFolder(parent)) AssetDatabase.CreateFolder(parent, folderName);
    }

    var guids = AssetDatabase.FindAssets(filter ?? "", new[] { fromFolder });
    int moved = 0;
    foreach (var g in guids)
    {
        var path = AssetDatabase.GUIDToAssetPath(g);
        var fileName = Path.GetFileName(path);
        var newPath = $"{toFolder}/{fileName}";
        var err = AssetDatabase.MoveAsset(path, newPath);
        if (string.IsNullOrEmpty(err)) moved++;
    }
    AssetDatabase.SaveAssets();
    return new { success = true, fromFolder, toFolder, moved };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
