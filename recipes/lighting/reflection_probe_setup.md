---
name: reflection_probe_setup
old_tool: reflection_probe_setup
request_type: reflectionProbeSetup
description: "Report or bake all ReflectionProbes. action=bake fires Lightmapping.BakeAllReflectionProbes."
category: lighting
tags: [unity, reflectionprobe]
params:
  - {name: action, type: string, required: false, desc: "enum: report|bake"}
kind: recipe
sync: job
requires: []
qa: clean
---
```csharp
// requires-using: System.IO
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string action = argd?.TryGetValue("action", out var a) == true ? a?.ToString() : "report";
    var probes = UnityEngine.Object.FindObjectsByType<ReflectionProbe>(FindObjectsSortMode.None);
    int baked = 0;
    if (action == "bake") { foreach (var pr in probes) { Lightmapping.BakeReflectionProbe(pr, ""); baked++; } }
    return new { success = true, probeCount = probes.Length, action, baked };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
