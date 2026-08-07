---
name: spritesheet_slicer
old_tool: spritesheet_slicer
request_type: spritesheetSlicer
description: "TextureImporter spriteImportMode + sheet count"
category: 2d-sprite
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEngine.Tilemaps, UnityEngine.U2D
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string assetPath = argd?.TryGetValue("assetPath", out var ap) == true ? ap?.ToString() : null; if (string.IsNullOrEmpty(assetPath)) { return new { success = false, error = "assetPath required" };  } var importer = AssetImporter.GetAtPath(assetPath) as TextureImporter; return new { success = importer != null, spriteImportMode = importer?.spriteImportMode.ToString(), spritesheetCount = string.IsNullOrEmpty(assetPath) ? 0 : AssetDatabase.LoadAllAssetRepresentationsAtPath(assetPath).Count(o => o is Sprite) }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
