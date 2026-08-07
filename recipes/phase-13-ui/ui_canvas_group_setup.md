---
name: ui_canvas_group_setup
old_tool: ui_canvas_group_setup
request_type: uiCanvasGroupSetup
description: "Phase 13 / ui / UiCanvasGroupSetup"
category: phase-13-ui
tags: [unity, phase13]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations, UnityEngine.UI
// --- injected helper shims (from Phase19RealHandler.cs) ---
GameObject Resolve(string n) { if (!string.IsNullOrEmpty(n)) { var g = GameObject.Find(n); if (g != null) return g; } return Selection.activeGameObject; }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    var go = Resolve(argd?.TryGetValue("targetName", out var tn) == true ? tn?.ToString() : null);
    if (go == null) { return new { success = false, error = "target required" };  }
    var cg = go.GetComponent<CanvasGroup>();
    if (cg == null) cg = Undo.AddComponent<CanvasGroup>(go);
    Undo.RecordObject(cg, "MCP CG setup");
    if (argd?.TryGetValue("alpha", out var a) == true && float.TryParse(a?.ToString(), out var af)) cg.alpha = af;
    if (argd?.TryGetValue("interactable", out var ia) == true && bool.TryParse(ia?.ToString(), out var iab)) cg.interactable = iab;
    if (argd?.TryGetValue("blocksRaycasts", out var br) == true && bool.TryParse(br?.ToString(), out var brb)) cg.blocksRaycasts = brb;
    return new { success = true, target = go.name, alpha = cg.alpha, interactable = cg.interactable, blocksRaycasts = cg.blocksRaycasts };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
