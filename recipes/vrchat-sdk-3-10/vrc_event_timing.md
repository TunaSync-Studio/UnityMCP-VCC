---
name: vrc_event_timing
old_tool: vrc_event_timing
request_type: vrcEventTiming
description: "Report UdonBehaviour count for EventTiming context (SDK 3.10+)."
category: vrchat-sdk-3-10
tags: [vrchat, udon, eventtiming]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from VRCSDK310Handler.cs) ---
Type FindType(string name) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == name); if (t != null) return t; } return null; }
// --- end shims ---
try
{
    var udonType = FindType("UdonBehaviour");
    int udonCount = udonType != null ? UnityEngine.Object.FindObjectsByType(udonType, FindObjectsSortMode.None).Length : 0;
    return new { success = true, udonBehaviourCount = udonCount, note = "EventTiming is configured per-UdonBehaviour. Use udonsharp_template_gen to scaffold." };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
