---
name: assetdatabase_move
old_tool: assetdatabase_move
request_type: assetDatabaseMove
description: "AssetDatabase.MoveAsset (auto-updates references). Creates parent folder if missing."
category: asset
tags: [unity, asset, move]
params:
  - {name: fromPath, type: string, required: true, desc: ""}
  - {name: toPath, type: string, required: true, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Text.RegularExpressions
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string fromPath = argd != null && argd.TryGetValue("fromPath", out var fp) && fp != null ? fp.ToString() : null;
    string toPath = argd != null && argd.TryGetValue("toPath", out var tp) && tp != null ? tp.ToString() : null;
    if (string.IsNullOrEmpty(fromPath) || string.IsNullOrEmpty(toPath)) { return new { success = false, error = "fromPath + toPath required" };  }

    var dir = Path.GetDirectoryName(toPath);
    if (!string.IsNullOrEmpty(dir) && !AssetDatabase.IsValidFolder(dir))
    {
        var parent = Path.GetDirectoryName(dir);
        var folder = Path.GetFileName(dir);
        if (!string.IsNullOrEmpty(parent) && !string.IsNullOrEmpty(folder))
            AssetDatabase.CreateFolder(parent, folder);
    }

    var err = AssetDatabase.MoveAsset(fromPath, toPath);
    if (!string.IsNullOrEmpty(err)) { return new { success = false, error = err };  }
    AssetDatabase.SaveAssets();

    return new
    {
        success = true,
        fromPath,
        toPath
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
