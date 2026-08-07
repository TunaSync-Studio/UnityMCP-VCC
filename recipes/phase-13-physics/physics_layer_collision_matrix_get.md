---
name: physics_layer_collision_matrix_get
old_tool: physics_layer_collision_matrix_get
request_type: physicsLayerCollisionMatrixGet
description: "Phase 13 / physics / PhysicsLayerCollisionMatrixGet"
category: phase-13-physics
tags: [unity, phase13]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations, UnityEditor.SceneManagement, UnityEngine.UI
try { var matrix = new List<object>(); for (int i = 0; i < 32; i++) for (int k = i; k < 32; k++) if (!Physics.GetIgnoreLayerCollision(i, k)) matrix.Add(new { layerA = i, layerB = k }); return new { success = true, activePairs = matrix.Count, sample = matrix.Take(50).ToList() }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
