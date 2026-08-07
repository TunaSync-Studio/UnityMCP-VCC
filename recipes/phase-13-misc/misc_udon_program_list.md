---
name: misc_udon_program_list
old_tool: misc_udon_program_list
request_type: miscUdonProgramList
description: "Phase 13 / misc / MiscUdonProgramList"
category: phase-13-misc
tags: [unity, phase13]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations, UnityEditor.SceneManagement, UnityEngine.UI
try { var guids = AssetDatabase.FindAssets("t:AbstractUdonProgramSource"); return new { success = true, count = guids.Length }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
