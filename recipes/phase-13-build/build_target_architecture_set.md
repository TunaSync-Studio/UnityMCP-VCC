---
name: build_target_architecture_set
old_tool: build_target_architecture_set
request_type: buildTargetArchitectureSet
description: "Phase 13 / build / BuildTargetArchitectureSet"
category: phase-13-build
tags: [unity, phase13]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations, UnityEditor.SceneManagement, UnityEngine.UI
try { return new { success = true, target = EditorUserBuildSettings.activeBuildTarget.ToString() }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
