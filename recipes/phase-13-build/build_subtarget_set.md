---
name: build_subtarget_set
old_tool: build_subtarget_set
request_type: buildSubtargetSet
description: "Phase 13 / build / BuildSubtargetSet"
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
try { return new { success = true, currentSubtarget = (int)EditorUserBuildSettings.standaloneBuildSubtarget }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
