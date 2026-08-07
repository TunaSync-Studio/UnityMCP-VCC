---
name: asset_metadata_inspect
old_tool: asset_metadata_inspect
request_type: assetMetadataInspect
description: "AssetImporter userData inspect"
category: asset-metadata
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string assetPath = argd?.TryGetValue("assetPath", out var ap) == true ? ap?.ToString() : null; if (string.IsNullOrEmpty(assetPath)) { return new { success = false, error = "assetPath required" };  } var importer = AssetImporter.GetAtPath(assetPath); return new { success = importer != null, importerType = importer?.GetType().Name, userData = importer?.userData }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
