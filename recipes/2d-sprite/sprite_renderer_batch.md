---
name: sprite_renderer_batch
old_tool: sprite_renderer_batch
request_type: spriteRendererBatch
description: "SpriteRenderer count"
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
try { var sprites = UnityEngine.Object.FindObjectsByType<SpriteRenderer>(FindObjectsSortMode.None); return new { success = true, spriteRendererCount = sprites.Length }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
