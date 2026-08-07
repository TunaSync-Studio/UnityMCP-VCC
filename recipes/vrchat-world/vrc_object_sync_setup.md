---
name: vrc_object_sync_setup
old_tool: vrc_object_sync_setup
request_type: vrcObjectSyncSetup
description: "Add VRCObjectSync + Rigidbody to target GameObject. SDK 3.10+ required."
category: vrchat-world
tags: [vrchat, objectsync, world]
params:
  - {name: targetName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.Reflection
// --- injected helper shims (from VRCWorldExtHandler.cs) ---
Type FindType(string name) {
            foreach (var a in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type[] types; try { types = a.GetTypes(); } catch { continue; }
                var t = types.FirstOrDefault(x => x.Name == name || x.FullName == name);
                if (t != null) return t;
            }
            return null;
        }
GameObject ResolveGo(string name) {
            if (!string.IsNullOrEmpty(name)) { var go = GameObject.Find(name); if (go != null) return go; }
            return Selection.activeGameObject;
        }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    var go = ResolveGo(argd != null && argd.TryGetValue("targetName", out var tn) ? tn?.ToString() : null);
    if (go == null) { return new { success = false, error = "target not found" };  }

    var syncType = FindType("VRCObjectSync");
    if (syncType == null) { return new { success = false, error = "VRCObjectSync type not found (VRC SDK 3.10+ required)" };  }

    bool added = false;
    if (go.GetComponent(syncType) == null) { Undo.AddComponent(go, syncType); added = true; }
    if (go.GetComponent<Rigidbody>() == null)
    {
        var rb = Undo.AddComponent<Rigidbody>(go);
        rb.useGravity = true;
        rb.isKinematic = false;
    }

    return new { success = true, target = go.name, added };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
