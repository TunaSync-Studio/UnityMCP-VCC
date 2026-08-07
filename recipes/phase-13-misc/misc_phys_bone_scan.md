---
name: misc_phys_bone_scan
old_tool: misc_phys_bone_scan
request_type: miscPhysBoneScan
description: "Phase 13 / misc / MiscPhysBoneScan"
category: phase-13-misc
tags: [unity, phase13, vrcsdk]
params: []
kind: recipe
sync: sync
requires: [vrcsdk]
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations, UnityEngine.UI
try
{
    var pbType = AppDomain.CurrentDomain.GetAssemblies().SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } }).FirstOrDefault(x => x.Name == "VRCPhysBone");
    if (pbType == null) { return new { success = false, error = "VRCPhysBone type not found" };  }
    var pbs = UnityEngine.Object.FindObjectsByType(pbType, FindObjectsSortMode.None);
    return new { success = true, count = pbs.Length };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
