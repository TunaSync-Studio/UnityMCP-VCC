---
name: ui_layoutgroup_setup
old_tool: ui_layoutgroup_setup
request_type: uiLayoutGroupSetup
description: "Add Vertical/Horizontal/Grid LayoutGroup to target."
category: ui-layout
tags: [unity, ui, layout]
params:
  - {name: targetName, type: string, required: false, desc: ""}
  - {name: layoutType, type: string, required: false, desc: "enum: Vertical|Horizontal|Grid"}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.Reflection, UnityEngine.AI, UnityEngine.UI
// --- injected helper shims (from UILayoutNavMeshHandler.cs) ---
GameObject Resolve(string n) { if (!string.IsNullOrEmpty(n)) { var g = GameObject.Find(n); if (g != null) return g; } return Selection.activeGameObject; }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    var go = Resolve(argd?.TryGetValue("targetName", out var tn) == true ? tn?.ToString() : null);
    if (go == null) { return new { success = false, error = "target required" };  }
    string layoutType = argd?.TryGetValue("layoutType", out var lt) == true ? lt?.ToString() : "Vertical";

    Type type = layoutType switch
    {
        "Vertical" => typeof(VerticalLayoutGroup),
        "Horizontal" => typeof(HorizontalLayoutGroup),
        "Grid" => typeof(GridLayoutGroup),
        _ => typeof(VerticalLayoutGroup)
    };
    if (go.GetComponent(type) == null) Undo.AddComponent(go, type);
    return new { success = true, target = go.name, layoutType };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
