---
name: graphics_settings_inspect
old_tool: graphics_settings_inspect
request_type: graphicsSettingsInspect
description: "GraphicsSettings inspection"
category: settings
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEngine.Tilemaps, UnityEngine.U2D
try { return new { success = true, currentRenderPipeline = UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline?.GetType().Name ?? "BuiltIn", note = "lightmapStripping API moved in Unity 2022 (configure via Graphics Project Settings)" }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
