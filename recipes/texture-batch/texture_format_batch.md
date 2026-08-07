---
name: texture_format_batch
old_tool: texture_format_batch
request_type: textureFormatBatch
description: "Batch toggle TextureImporter.crunchedCompression on all Texture2D in folder."
category: texture-batch
tags: [unity, texture, crunch]
params:
  - {name: folder, type: string, required: false, desc: ""}
  - {name: crunchCompression, type: boolean, required: false, desc: ""}
kind: recipe
sync: job
requires: []
qa: clean
---
```csharp
// requires-using: System.IO
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string folder = argd?.TryGetValue("folder", out var f) == true ? f?.ToString() : null;
    bool crunch = argd?.TryGetValue("crunchCompression", out var cc) == true && bool.Parse(cc?.ToString() ?? "false");

    var guids = AssetDatabase.FindAssets("t:Texture2D", folder != null ? new[] { folder } : null);
    int affected = 0;
    foreach (var g in guids)
    {
        var path = AssetDatabase.GUIDToAssetPath(g);
        var importer = AssetImporter.GetAtPath(path) as TextureImporter;
        if (importer == null) continue;
        importer.crunchedCompression = crunch;
        importer.SaveAndReimport();
        affected++;
    }
    return new { success = true, affected, crunchEnabled = crunch };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
