---
name: build_build_options_export
old_tool: build_build_options_export
request_type: buildBuildOptionsExport
description: "Phase 13 / build / BuildBuildOptionsExport"
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
try { return new { success = true, target = EditorUserBuildSettings.activeBuildTarget.ToString(), development = EditorUserBuildSettings.development, allowDebugging = EditorUserBuildSettings.allowDebugging, scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray() }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
