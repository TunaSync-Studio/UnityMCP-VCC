---
name: vrc_persistence_data_export
old_tool: vrc_persistence_data_export
request_type: vrcPersistenceDataExport
description: "Count VRCEnablePersistence + 1KB-per-player limit. Persistence data is server-side; local export needs VRChat client log access."
category: vrchat-advanced
tags: [vrchat, persistence]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from VRChatAdvHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try
{
    var enableType = FindType("VRCEnablePersistence");
    int count = enableType != null ? UnityEngine.Object.FindObjectsByType(enableType, FindObjectsSortMode.None).Length : 0;
    return new
    {
        success = true,
        enablePersistenceCount = count,
        perPlayerLimitBytes = 1024,
        note = "Persistence data is server-side. Local export requires VRChat client log access (per-player JSON in user data folder)."
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
