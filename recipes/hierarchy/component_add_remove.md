---
name: component_add_remove
old_tool: component_add_remove
request_type: componentAddRemove
description: "Generic component add/remove on target GameObject by type name (reflection)."
category: hierarchy
tags: [unity, component]
params:
  - {name: targetName, type: string, required: false, desc: ""}
  - {name: componentType, type: string, required: true, desc: ""}
  - {name: action, type: string, required: false, desc: "enum: add|remove"}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.PackageManager, UnityEditor.PackageManager.Requests
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string targetName = argd != null && argd.TryGetValue("targetName", out var tn) ? tn?.ToString() : null;
    string componentType = argd != null && argd.TryGetValue("componentType", out var ct) ? ct?.ToString() : null;
    string action = argd != null && argd.TryGetValue("action", out var a) ? a?.ToString() : "add";

    GameObject target = null;
    if (!string.IsNullOrEmpty(targetName)) target = GameObject.Find(targetName);
    if (target == null) target = Selection.activeGameObject;
    if (target == null || string.IsNullOrEmpty(componentType)) { return new { success = false, error = "target + componentType required" };  }

    Type compType = AppDomain.CurrentDomain.GetAssemblies()
        .SelectMany(asm => { try { return asm.GetTypes(); } catch { return new Type[0]; } })
        .FirstOrDefault(tt => tt.Name == componentType || tt.FullName == componentType);
    if (compType == null) { return new { success = false, error = $"type {componentType} not found" };  }

    bool result;
    if (action == "remove")
    {
        var c = target.GetComponent(compType);
        if (c != null) { Undo.DestroyObjectImmediate(c); result = true; } else result = false;
    }
    else
    {
        Undo.AddComponent(target, compType);
        result = true;
    }

    return new { success = true, target = target.name, componentType, action, result };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
