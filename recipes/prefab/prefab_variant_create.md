---
name: prefab_variant_create
old_tool: prefab_variant_create
request_type: prefabVariantCreate
description: "Create Prefab Variant from source prefab. Useful for chimera avatar variants."
category: prefab
tags: [unity, prefab, variant]
params:
  - {name: sourcePath, type: string, required: true, desc: ""}
  - {name: outputPath, type: string, required: true, desc: ""}
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
    string sourcePath = argd != null && argd.TryGetValue("sourcePath", out var sp) && sp != null ? sp.ToString() : null;
    string outputPath = argd != null && argd.TryGetValue("outputPath", out var op) && op != null ? op.ToString() : null;
    if (string.IsNullOrEmpty(sourcePath) || string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "sourcePath + outputPath required" };  }

    var source = AssetDatabase.LoadAssetAtPath<GameObject>(sourcePath);
    if (source == null) { return new { success = false, error = "source prefab not found" };  }

    var instance = (GameObject)PrefabUtility.InstantiatePrefab(source);
    Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
    var variant = PrefabUtility.SaveAsPrefabAsset(instance, outputPath);
    UnityEngine.Object.DestroyImmediate(instance);

    return new
    {
        success = true,
        sourcePath,
        outputPath,
        variantCreated = variant != null
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
