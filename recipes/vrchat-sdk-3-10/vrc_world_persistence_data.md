---
name: vrc_world_persistence_data
old_tool: vrc_world_persistence_data
request_type: vrcWorldPersistenceData
description: "Detailed VRCEnablePersistence audit + 1KB-per-player limit reminder."
category: vrchat-sdk-3-10
tags: [vrchat, persistence]
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
    var enableType = FindType("VRCEnablePersistence");
    int count = 0;
    if (enableType != null) count = UnityEngine.Object.FindObjectsByType(enableType, FindObjectsSortMode.None).Length;
    return new { success = true, enablePersistenceCount = count, perPlayerLimitBytes = 1024, note = "1KB per player. Use UdonSynced + FieldChangeCallback in U#." };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
