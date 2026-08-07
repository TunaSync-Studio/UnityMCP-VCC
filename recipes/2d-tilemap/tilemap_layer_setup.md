---
name: tilemap_layer_setup
old_tool: tilemap_layer_setup
request_type: tilemapLayerSetup
description: "Grid component count"
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
try { var grids = UnityEngine.Object.FindObjectsByType<Grid>(FindObjectsSortMode.None); return new { success = true, gridCount = grids.Length }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
