---
name: physics_physics_simulation_mode_set
old_tool: physics_physics_simulation_mode_set
request_type: physicsPhysicsSimulationModeSet
description: "Phase 13 / physics / PhysicsPhysicsSimulationModeSet"
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
// alias: HandlePhysicsPhysicsSimulationModeSet delegates to HandlePhysicsSimulationModeSet in legacy code
try { return new { success = true, simulationMode = Physics.simulationMode.ToString() }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
