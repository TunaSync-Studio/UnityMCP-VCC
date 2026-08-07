---
name: lightmap_settings_set
old_tool: lightmap_settings_set
request_type: lightmapSettingsSet
description: "Get/set Lightmapping.bakedGI / realtimeGI flags."
category: lighting
tags: [unity, lightmap, gi]
params:
  - {name: action, type: string, required: false, desc: "enum: report|set"}
  - {name: bakedGI, type: boolean, required: false, desc: ""}
  - {name: realtimeGI, type: boolean, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string action = argd?.TryGetValue("action", out var a) == true ? a?.ToString() : "report";
    if (action == "set")
    {
        if (argd.TryGetValue("bakedGI", out var bg)) Lightmapping.bakedGI = bool.Parse(bg?.ToString() ?? "false");
        if (argd.TryGetValue("realtimeGI", out var rg)) Lightmapping.realtimeGI = bool.Parse(rg?.ToString() ?? "false");
    }
    return new { success = true, bakedGI = Lightmapping.bakedGI, realtimeGI = Lightmapping.realtimeGI };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
