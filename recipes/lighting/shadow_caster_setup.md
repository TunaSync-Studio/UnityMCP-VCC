---
name: shadow_caster_setup
old_tool: shadow_caster_setup
request_type: shadowCasterSetup
description: "Shadow casting Light count"
category: lighting
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Build
try { var lights = UnityEngine.Object.FindObjectsByType<Light>(FindObjectsSortMode.None); int castShadow = lights.Count(l => l.shadows != LightShadows.None); return new { success = true, totalLights = lights.Length, shadowCasters = castShadow }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
