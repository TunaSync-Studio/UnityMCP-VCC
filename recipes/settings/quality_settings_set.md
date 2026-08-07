---
name: quality_settings_set
old_tool: quality_settings_set
request_type: qualitySettingsSet
description: "Get current QualitySettings or set quality level by index. action=report (default) / set."
category: settings
tags: [unity, quality]
params:
  - {name: action, type: string, required: false, desc: "enum: report|set"}
  - {name: qualityLevel, type: number, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.PackageManager, UnityEditor.PackageManager.Requests
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string action = argd != null && argd.TryGetValue("action", out var a) ? a?.ToString() : "report";

    if (action == "set")
    {
        int level = argd != null && argd.TryGetValue("qualityLevel", out var ql) && int.TryParse(ql?.ToString(), out var lvl) ? lvl : 0;
        QualitySettings.SetQualityLevel(level, true);
    }

    return new
    {
        success = true,
        currentLevel = QualitySettings.GetQualityLevel(),
        currentLevelName = QualitySettings.names[QualitySettings.GetQualityLevel()],
        allLevels = QualitySettings.names,
        pixelLightCount = QualitySettings.pixelLightCount,
        vSyncCount = QualitySettings.vSyncCount,
        antiAliasing = QualitySettings.antiAliasing
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
