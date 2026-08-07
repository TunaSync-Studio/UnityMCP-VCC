---
name: sprite_packer_audit
old_tool: sprite_packer_audit
request_type: spritePackerAudit
description: "SpriteAtlas list"
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
try { var guids = AssetDatabase.FindAssets("t:SpriteAtlas"); return new { success = true, atlasCount = guids.Length, paths = guids.Select(g => AssetDatabase.GUIDToAssetPath(g)).ToList() }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
