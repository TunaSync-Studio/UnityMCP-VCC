---
name: misc_shader_list_export
old_tool: misc_shader_list_export
request_type: miscShaderListExport
description: "Phase 13 / misc / MiscShaderListExport"
category: phase-13-misc
tags: [unity, phase13]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations, UnityEditor.SceneManagement, UnityEngine.UI
try { var guids = AssetDatabase.FindAssets("t:Shader"); return new { success = true, count = guids.Length }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
