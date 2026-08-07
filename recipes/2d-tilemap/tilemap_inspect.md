---
name: tilemap_inspect
old_tool: tilemap_inspect
request_type: tilemapInspect
description: "Tilemap count + total tiles"
category: 2d-tilemap
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEngine.Tilemaps, UnityEngine.U2D
try { var tilemaps = UnityEngine.Object.FindObjectsByType<Tilemap>(FindObjectsSortMode.None); return new { success = true, tilemapCount = tilemaps.Length, totalTiles = tilemaps.Sum(tm => { tm.CompressBounds(); return tm.size.x * tm.size.y; }) }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
