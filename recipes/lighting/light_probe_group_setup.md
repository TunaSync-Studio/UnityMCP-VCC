---
name: light_probe_group_setup
old_tool: light_probe_group_setup
request_type: lightProbeGroupSetup
description: "Report all LightProbeGroup components + total probe positions."
category: lighting
tags: [unity, lightprobe]
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
    var groups = UnityEngine.Object.FindObjectsByType<LightProbeGroup>(FindObjectsSortMode.None);
    int totalProbes = groups.Sum(g => g.probePositions?.Length ?? 0);
    return new { success = true, groupCount = groups.Length, totalProbes };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
