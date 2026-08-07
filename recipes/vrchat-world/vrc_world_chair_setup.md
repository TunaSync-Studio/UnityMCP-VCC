---
name: vrc_world_chair_setup
old_tool: vrc_world_chair_setup
request_type: vrcWorldChairSetup
description: "Add VRCStation component to target (chair / station for sit gimmick)."
category: vrchat-world
tags: [vrchat, station, chair]
params:
  - {name: targetName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.Reflection
// --- injected helper shims (from VRCWorldGimmickHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n); if (t != null) return t; } return null; }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string targetName = argd?.TryGetValue("targetName", out var tn) == true ? tn?.ToString() : null;
    GameObject target = !string.IsNullOrEmpty(targetName) ? GameObject.Find(targetName) : Selection.activeGameObject;
    if (target == null) { return new { success = false, error = "target required" };  }

    var stationType = FindType("VRCStation") ?? FindType("VRC_Station");
    if (stationType == null) { return new { success = false, error = "VRCStation type not found" };  }
    bool added = false;
    if (target.GetComponent(stationType) == null) { Undo.AddComponent(target, stationType); added = true; }

    return new { success = true, target = target.name, added };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
