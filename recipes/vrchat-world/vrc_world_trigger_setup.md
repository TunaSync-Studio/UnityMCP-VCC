---
name: vrc_world_trigger_setup
old_tool: vrc_world_trigger_setup
request_type: vrcWorldTriggerSetup
description: "Add isTrigger BoxCollider (or set existing collider's isTrigger=true). Combine with udonsharp_template_gen for handler."
category: vrchat-world
tags: [vrchat, trigger, udon]
params:
  - {name: targetName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.Reflection
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string targetName = argd?.TryGetValue("targetName", out var tn) == true ? tn?.ToString() : null;
    GameObject target = !string.IsNullOrEmpty(targetName) ? GameObject.Find(targetName) : Selection.activeGameObject;
    if (target == null) { return new { success = false, error = "target required" };  }

    if (target.GetComponent<Collider>() == null) { var c = Undo.AddComponent<BoxCollider>(target); c.isTrigger = true; }
    else if (target.GetComponent<Collider>() is Collider cc) { Undo.RecordObject(cc, "MCP trigger"); cc.isTrigger = true; }

    return new { success = true, target = target.name, note = "Use udonsharp_template_gen for OnEnter/OnInteract handler." };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
