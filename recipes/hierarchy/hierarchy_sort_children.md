---
name: hierarchy_sort_children
old_tool: hierarchy_sort_children
request_type: hierarchySortChildren
description: "Sort root's direct children alphabetically by name (case-insensitive)."
category: hierarchy
tags: [unity, hierarchy, sort]
params:
  - {name: rootName, type: string, required: false, desc: ""}
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
    var root = Resolve(argd?.TryGetValue("rootName", out var rn) == true ? rn?.ToString() : null);
    if (root == null) { return new { success = false, error = "root required" };  }

    var children = new List<Transform>();
    for (int i = 0; i < root.transform.childCount; i++) children.Add(root.transform.GetChild(i));
    children.Sort((a, b) => string.Compare(a.name, b.name, StringComparison.OrdinalIgnoreCase));
    for (int i = 0; i < children.Count; i++) { Undo.SetTransformParent(children[i], root.transform, "MCP sort"); children[i].SetSiblingIndex(i); }

    return new { success = true, root = root.name, sortedCount = children.Count };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
