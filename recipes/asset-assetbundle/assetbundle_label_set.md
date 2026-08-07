---
name: assetbundle_label_set
old_tool: assetbundle_label_set
request_type: assetBundleLabelSet
description: "Set AssetImporter.assetBundleName for given asset path."
category: asset-assetbundle
tags: [unity, assetbundle]
params:
  - {name: assetPath, type: string, required: true, desc: ""}
  - {name: bundleName, type: string, required: true, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string assetPath = argd?.TryGetValue("assetPath", out var ap) == true ? ap?.ToString() : null;
    string bundleName = argd?.TryGetValue("bundleName", out var bn) == true ? bn?.ToString() : null;
    if (string.IsNullOrEmpty(assetPath) || string.IsNullOrEmpty(bundleName)) { return new { success = false, error = "assetPath + bundleName required" };  }

    var importer = AssetImporter.GetAtPath(assetPath);
    if (importer == null) { return new { success = false, error = "asset not found" };  }
    importer.assetBundleName = bundleName;
    return new { success = true, assetPath, bundleName };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
