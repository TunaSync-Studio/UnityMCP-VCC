---
name: texture_mipmap_batch
old_tool: texture_mipmap_batch
request_type: textureMipmapBatch
description: "Batch toggle TextureImporter.mipmapEnabled."
category: texture-batch
tags: [unity, texture, mipmap]
params:
  - {name: folder, type: string, required: false, desc: ""}
  - {name: mipmapEnabled, type: boolean, required: false, desc: ""}
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
    bool mipmap = argd?.TryGetValue("mipmapEnabled", out var mm) == true && bool.Parse(mm?.ToString() ?? "true");

    var guids = AssetDatabase.FindAssets("t:Texture2D", folder != null ? new[] { folder } : null);
    int affected = 0;
    foreach (var g in guids)
    {
        var path = AssetDatabase.GUIDToAssetPath(g);
        var importer = AssetImporter.GetAtPath(path) as TextureImporter;
        if (importer == null) continue;
        importer.mipmapEnabled = mipmap;
        importer.SaveAndReimport();
        affected++;
    }
    return new { success = true, affected, mipmapEnabled = mipmap };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
