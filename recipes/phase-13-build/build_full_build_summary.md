---
name: build_full_build_summary
old_tool: build_full_build_summary
request_type: buildFullBuildSummary
description: "Phase 13 / build / BuildFullBuildSummary"
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
try { return new { success = true, productName = PlayerSettings.productName, version = PlayerSettings.bundleVersion, target = EditorUserBuildSettings.activeBuildTarget.ToString(), enabledScenes = EditorBuildSettings.scenes.Count(s => s.enabled), defines = PlayerSettings.GetScriptingDefineSymbols(UnityEditor.Build.NamedBuildTarget.Standalone), backend = PlayerSettings.GetScriptingBackend(UnityEditor.Build.NamedBuildTarget.Standalone).ToString() }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
