---
name: postprocessing_volume_setup
old_tool: postprocessing_volume_setup
request_type: postProcessingVolumeSetup
description: "Count UnityEngine.Rendering.Volume (URP/HDRP post-processing)."
category: rendering-urp
tags: [unity, postprocessing, volume]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.Reflection
// --- injected helper shims (from URPHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try
{
    var volumeType = FindType("UnityEngine.Rendering.Volume");
    int count = volumeType != null ? UnityEngine.Object.FindObjectsByType(volumeType, FindObjectsSortMode.None).Length : 0;
    return new { success = true, urpVolumeCount = count, volumeTypeAvailable = volumeType != null };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
