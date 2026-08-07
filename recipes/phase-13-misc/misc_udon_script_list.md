---
name: misc_udon_script_list
old_tool: misc_udon_script_list
request_type: miscUdonScriptList
description: "Phase 13 / misc / MiscUdonScriptList"
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
    var udonBehType = AppDomain.CurrentDomain.GetAssemblies().SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } }).FirstOrDefault(x => x.Name == "UdonBehaviour");
    if (udonBehType == null) { return new { success = false, error = "UdonBehaviour type not found" };  }
    var behs = UnityEngine.Object.FindObjectsByType(udonBehType, FindObjectsSortMode.None);
    var list = behs.Select(b => (b as Component)?.gameObject.name).Where(x => x != null).Take(200).ToList();
    return new { success = true, count = behs.Length, sample = list };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
