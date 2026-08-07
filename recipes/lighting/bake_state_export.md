---
name: bake_state_export
old_tool: bake_state_export
request_type: bakeStateExport
description: "Export Lightmapping.lightingSettings (resolution / sample count) + isRunning state."
category: lighting
tags: [unity, bake, settings]
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
    var lm = Lightmapping.lightingSettings;
    return new
    {
        success = true,
        bakedGI = Lightmapping.bakedGI,
        realtimeGI = Lightmapping.realtimeGI,
        isRunning = Lightmapping.isRunning,
        settingsName = lm != null ? lm.name : "(none)",
        indirectResolution = lm?.indirectResolution,
        lightmapResolution = lm?.lightmapResolution,
        sampleCount = lm?.directSampleCount
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
