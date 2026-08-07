---
name: scene_lighting_preset_apply
old_tool: scene_lighting_preset_apply
request_type: sceneLightingPresetApply
description: "Apply scene lighting preset: vrchat-world (bakedGI+Skybox) / vrchat-avatar (Trilight ambient) / cyber-dim (Flat dark blue)."
category: lighting
tags: [unity, lighting, preset]
params:
  - {name: preset, type: string, required: false, desc: "enum: standard|vrchat-world|vrchat-avatar|cyber-dim"}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.SceneManagement
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string preset = argd?.TryGetValue("preset", out var p) == true ? p?.ToString() : "standard";

    if (preset == "vrchat-world")
    {
        Lightmapping.bakedGI = true;
        Lightmapping.realtimeGI = false;
        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Skybox;
    }
    else if (preset == "vrchat-avatar")
    {
        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
        RenderSettings.ambientSkyColor = new Color(1, 1, 1);
        RenderSettings.ambientGroundColor = new Color(0.5f, 0.5f, 0.5f);
    }
    else if (preset == "cyber-dim")
    {
        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
        RenderSettings.ambientLight = new Color(0.15f, 0.18f, 0.25f);
    }
    return new { success = true, preset, ambientMode = RenderSettings.ambientMode.ToString() };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
