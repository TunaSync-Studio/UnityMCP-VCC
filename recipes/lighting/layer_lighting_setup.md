---
name: layer_lighting_setup
old_tool: layer_lighting_setup
request_type: layerLightingSetup
description: "RenderSettings ambient/reflection mode report"
category: lighting
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.SceneManagement
try { return new { success = true, ambientMode = RenderSettings.ambientMode.ToString(), defaultReflectionMode = RenderSettings.defaultReflectionMode.ToString() }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
