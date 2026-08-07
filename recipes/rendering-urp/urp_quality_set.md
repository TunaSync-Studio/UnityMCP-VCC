---
name: urp_quality_set
old_tool: urp_quality_set
request_type: urpQualitySet
description: "Report current QualitySettings level + name. URP per-quality RP Asset switch via Editor manual."
category: rendering-urp
tags: [unity, urp, quality]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.Reflection
try
{
    return new
    {
        success = true,
        currentQualityLevel = QualitySettings.GetQualityLevel(),
        qualityName = QualitySettings.names[QualitySettings.GetQualityLevel()],
        note = "URP per-quality-level RP Asset switch via QualitySettings.renderPipeline assignment in Editor."
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
