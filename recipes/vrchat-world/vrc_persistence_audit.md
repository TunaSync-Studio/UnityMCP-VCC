---
name: vrc_persistence_audit
old_tool: vrc_persistence_audit
request_type: vrcPersistenceAudit
description: "Count VRCEnablePersistence components + UdonBehaviours in scene. 1KB-per-player limit reminder."
category: vrchat-world
tags: [vrchat, persistence, audit]
params: []
kind: recipe
sync: sync
requires: []
qa: review
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from VRChatExtHandler.cs) ---
Type FindType(string name) {
            foreach (var a in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type[] types;
                try { types = a.GetTypes(); } catch { continue; }
                var t = types.FirstOrDefault(x => x.Name == name || x.FullName == name);
                if (t != null) return t;
            }
            return null;
        }
// --- end shims ---
try
{
    var enableType = FindType("VRCEnablePersistence");
    int enableCount = 0;
    var details = new List<Dictionary<string, object>>();
    if (enableType != null)
    {
        foreach (var go in UnityEngine.Object.FindObjectsByType<GameObject>(FindObjectsSortMode.None))
        {
            var c = go.GetComponent(enableType);
            if (c != null) { enableCount++; details.Add(new Dictionary<string, object> { ["path"] = go.name }); }
        }
    }

    var udonBehType = FindType("UdonBehaviour");
    int syncedCount = 0;
    if (udonBehType != null)
    {
        foreach (var ub in UnityEngine.Object.FindObjectsByType(udonBehType, FindObjectsSortMode.None))
        {
            var publicVars = ub.GetType().GetField("publicVariables", BindingFlags.NonPublic | BindingFlags.Instance);
            if (publicVars != null) syncedCount++;
        }
    }

    return new
    {
        success = true,
        enablePersistenceCount = enableCount,
        udonBehaviourCount = syncedCount,
        persistencePerPlayerLimitBytes = 1024,
        details
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
