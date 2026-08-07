---
name: misc_network_id_scan
old_tool: misc_network_id_scan
request_type: miscNetworkIdScan
description: "Phase 13 / misc / MiscNetworkIdScan"
category: phase-13-misc
tags: [unity, phase13]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations, UnityEngine.UI
try
{
    var sceneDescType = AppDomain.CurrentDomain.GetAssemblies().SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } }).FirstOrDefault(x => x.Name == "VRCSceneDescriptor");
    if (sceneDescType == null) { return new { success = false, error = "VRCSceneDescriptor not found" };  }
    var desc = UnityEngine.Object.FindFirstObjectByType(sceneDescType) as Component;
    if (desc == null) { return new { success = false, error = "no VRCSceneDescriptor in scene" };  }
    var nidField = sceneDescType.GetField("networkIDCollection") ?? sceneDescType.GetField("NetworkIDCollection");
    var coll = nidField?.GetValue(desc);
    int count = 0;
    if (coll is System.Collections.IList list) count = list.Count;
    return new { success = true, networkIdCount = count };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
