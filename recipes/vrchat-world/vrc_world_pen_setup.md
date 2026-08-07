---
name: vrc_world_pen_setup
old_tool: vrc_world_pen_setup
request_type: vrcWorldPenSetup
description: "VRCPen prefab detect"
category: vrchat-world
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEngine.Tilemaps, UnityEngine.U2D
try { var guids = AssetDatabase.FindAssets("VRCPen t:Prefab"); return new { success = true, vrcPenPrefabAvailable = guids.Length > 0, count = guids.Length }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
