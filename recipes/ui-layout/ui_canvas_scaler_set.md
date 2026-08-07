---
name: ui_canvas_scaler_set
old_tool: ui_canvas_scaler_set
request_type: uiCanvasScalerSet
description: "Add CanvasScaler with ScaleWithScreenSize (1920x1080 default)."
category: ui-layout
tags: [unity, ui, canvasscaler]
params:
  - {name: targetName, type: string, required: false, desc: ""}
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

    var scaler = go.GetComponent<CanvasScaler>();
    if (scaler == null) scaler = Undo.AddComponent<CanvasScaler>(go);
    Undo.RecordObject(scaler, "MCP scaler");
    scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
    scaler.referenceResolution = new Vector2(1920, 1080);
    return new { success = true, target = go.name };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
