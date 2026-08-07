---
name: hierarchy_parent_change
old_tool: hierarchy_parent_change
request_type: hierarchyParentChange
description: "Change child's parent (Undo.SetTransformParent). Empty newParentName moves to scene root."
category: hierarchy
tags: [unity, hierarchy, parent]
params:
  - {name: childName, type: string, required: true, desc: ""}
  - {name: newParentName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string childName = argd?.TryGetValue("childName", out var cn) == true ? cn?.ToString() : null;
    string newParentName = argd?.TryGetValue("newParentName", out var pn) == true ? pn?.ToString() : null;
    if (string.IsNullOrEmpty(childName)) { return new { success = false, error = "childName required" };  }

    var child = GameObject.Find(childName);
    if (child == null) { return new { success = false, error = "child not found" };  }

    Transform newParent = null;
    if (!string.IsNullOrEmpty(newParentName)) { var p = GameObject.Find(newParentName); if (p != null) newParent = p.transform; }

    Undo.SetTransformParent(child.transform, newParent, "MCP parent change");
    return new { success = true, child = child.name, newParent = newParent != null ? newParent.name : "(root)" };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
