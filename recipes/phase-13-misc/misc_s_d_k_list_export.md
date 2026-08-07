---
name: misc_s_d_k_list_export
old_tool: misc_s_d_k_list_export
request_type: miscSDKListExport
description: "Phase 13 / misc / MiscSDKListExport"
category: phase-13-misc
tags: [unity, phase13, vrcsdk]
params: []
kind: recipe
sync: sync
requires: [vrcsdk]
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations, UnityEditor.SceneManagement, UnityEngine.UI
try { var sdks = AppDomain.CurrentDomain.GetAssemblies().Select(a => a.GetName().Name).Where(n => n.Contains("VRC") || n.Contains("VRChat") || n.Contains("UdonSharp") || n.Contains("ndmf") || n.Contains("VRCFury") || n.Contains("lilycal") || n.Contains("AvatarOptimizer")).Distinct().ToList(); return new { success = true, count = sdks.Count, sdks }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
