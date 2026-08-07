---
name: sprite_atlas_create
old_tool: sprite_atlas_create
request_type: spriteAtlasCreate
description: "SpriteAtlas create"
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
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null; if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  } var atlas = new SpriteAtlas(); Directory.CreateDirectory(Path.GetDirectoryName(outputPath)); AssetDatabase.CreateAsset(atlas, outputPath); AssetDatabase.SaveAssets(); return new { success = true, outputPath }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
