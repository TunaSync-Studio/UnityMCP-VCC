---
name: shader_shader_l_o_d
old_tool: shader_shader_l_o_d
request_type: shaderShaderLOD
description: "Phase 13 / shader / ShaderShaderLOD"
category: phase-13-shader
tags: [unity, phase13]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations, UnityEditor.SceneManagement, UnityEngine.UI
// alias: HandleShaderShaderLOD delegates to HandleShaderLOD in legacy code
try { var guids = AssetDatabase.FindAssets("t:Shader"); return new { success = true, totalShaders = guids.Length }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
