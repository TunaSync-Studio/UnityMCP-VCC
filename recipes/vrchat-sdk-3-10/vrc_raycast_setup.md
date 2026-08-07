---
name: vrc_raycast_setup
old_tool: vrc_raycast_setup
request_type: vrcRaycastSetup
description: "Add VRCRaycast component (SDK 3.10+) to target."
category: vrchat-sdk-3-10
tags: [vrchat, raycast]
params:
  - {name: targetName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from VRCSDK310Handler.cs) ---
Type FindType(string name) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == name); if (t != null) return t; } return null; }
GameObject Resolve(string n) { if (!string.IsNullOrEmpty(n)) { var g = GameObject.Find(n); if (g != null) return g; } return Selection.activeGameObject; }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    var go = Resolve(argd != null && argd.TryGetValue("targetName", out var tn) ? tn?.ToString() : null);
    if (go == null) { return new { success = false, error = "target not found" };  }

    var rcType = FindType("VRCRaycast");
    if (rcType == null) { return new { success = false, error = "VRCRaycast type not found (SDK 3.10+)" };  }
    bool added = false;
    if (go.GetComponent(rcType) == null) { Undo.AddComponent(go, rcType); added = true; }
    return new { success = true, target = go.name, added };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
