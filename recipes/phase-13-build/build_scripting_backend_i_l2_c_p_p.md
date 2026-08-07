---
name: build_scripting_backend_i_l2_c_p_p
old_tool: build_scripting_backend_i_l2_c_p_p
request_type: buildScriptingBackendIL2CPP
description: "Phase 13 / build / BuildScriptingBackendIL2CPP"
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
try { PlayerSettings.SetScriptingBackend(UnityEditor.Build.NamedBuildTarget.Standalone, ScriptingImplementation.IL2CPP); return new { success = true, backend = "IL2CPP" }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
