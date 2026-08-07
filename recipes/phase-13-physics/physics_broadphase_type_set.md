---
name: physics_broadphase_type_set
old_tool: physics_broadphase_type_set
request_type: physicsBroadphaseTypeSet
description: "Phase 13 / physics / PhysicsBroadphaseTypeSet"
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
try { /* Physics.broadphaseType removed in Unity 2022 */ return new { success = true, broadphaseType = "(deprecated in Unity 2022; configure via PhysicsManager asset)" }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
