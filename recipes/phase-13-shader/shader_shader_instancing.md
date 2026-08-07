---
name: shader_shader_instancing
old_tool: shader_shader_instancing
request_type: shaderShaderInstancing
description: "Phase 13 / shader / ShaderShaderInstancing"
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
// alias: HandleShaderShaderInstancing delegates to HandleShaderInstancing in legacy code
// --- injected helper shims (from Phase20RealHandler.cs) ---
Material LoadMat(string p) => AssetDatabase.LoadAssetAtPath<Material>(p);
// --- end shims ---
try { var guids = AssetDatabase.FindAssets("t:Material"); int instancing = 0; foreach (var g in guids) { var m = LoadMat(AssetDatabase.GUIDToAssetPath(g)); if (m?.enableInstancing == true) instancing++; } return new { success = true, total = guids.Length, instancingEnabled = instancing }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
