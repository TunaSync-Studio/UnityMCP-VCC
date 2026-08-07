---
name: ui_anchor_preset_apply
old_tool: ui_anchor_preset_apply
request_type: uiAnchorPresetApply
description: "Apply RectTransform anchor preset: stretch (full) / center / topleft."
category: ui-layout
tags: [unity, ui, anchor]
params:
  - {name: targetName, type: string, required: false, desc: ""}
  - {name: preset, type: string, required: false, desc: "enum: stretch|center|topleft"}
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
    string preset = argd?.TryGetValue("preset", out var p) == true ? p?.ToString() : "stretch";

    var rt = go.GetComponent<RectTransform>();
    if (rt == null) { return new { success = false, error = "no RectTransform on target" };  }
    Undo.RecordObject(rt, "MCP anchor");
    if (preset == "stretch") { rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one; rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero; }
    else if (preset == "center") { rt.anchorMin = new Vector2(0.5f, 0.5f); rt.anchorMax = new Vector2(0.5f, 0.5f); rt.pivot = new Vector2(0.5f, 0.5f); }
    else if (preset == "topleft") { rt.anchorMin = new Vector2(0, 1); rt.anchorMax = new Vector2(0, 1); rt.pivot = new Vector2(0, 1); }
    return new { success = true, target = go.name, preset };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
