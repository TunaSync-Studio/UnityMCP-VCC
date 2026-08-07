---
name: hierarchy_duplicate
old_tool: hierarchy_duplicate
request_type: hierarchyDuplicate
description: "Instantiate duplicate of target as sibling."
category: hierarchy
tags: [unity, hierarchy, duplicate]
params:
  - {name: targetName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// --- injected helper shims (from HierarchyOpsHandler.cs) ---
GameObject Resolve(string n) { if (!string.IsNullOrEmpty(n)) { var g = GameObject.Find(n); if (g != null) return g; } return Selection.activeGameObject; }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    var go = Resolve(argd?.TryGetValue("targetName", out var tn) == true ? tn?.ToString() : null);
    if (go == null) { return new { success = false, error = "target required" };  }

    var copy = UnityEngine.Object.Instantiate(go, go.transform.parent);
    copy.name = go.name + " (Copy)";
    Undo.RegisterCreatedObjectUndo(copy, "MCP duplicate");
    return new { success = true, source = go.name, copy = copy.name };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
