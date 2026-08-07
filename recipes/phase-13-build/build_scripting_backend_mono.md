---
name: build_scripting_backend_mono
old_tool: build_scripting_backend_mono
request_type: buildScriptingBackendMono
description: "Phase 13 / build / BuildScriptingBackendMono"
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
try { PlayerSettings.SetScriptingBackend(UnityEditor.Build.NamedBuildTarget.Standalone, ScriptingImplementation.Mono2x); return new { success = true, backend = "Mono" }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
