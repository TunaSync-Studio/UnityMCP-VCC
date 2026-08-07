---
name: directional_light_optimize
old_tool: directional_light_optimize
request_type: directionalLightOptimize
description: "Report scene Light count + RenderSettings ambient mode/color."
category: lighting
tags: [unity, directional, ambient]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO
try
{
    var lights = UnityEngine.Object.FindObjectsByType<Light>(FindObjectsSortMode.None);
    var directional = lights.Where(l => l.type == LightType.Directional).ToList();
    int total = lights.Length;
    int dir = directional.Count;
    return new
    {
        success = true,
        totalLights = total,
        directionalCount = dir,
        ambientMode = RenderSettings.ambientMode.ToString(),
        ambientSkyColor = new[] { RenderSettings.ambientSkyColor.r, RenderSettings.ambientSkyColor.g, RenderSettings.ambientSkyColor.b }
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
