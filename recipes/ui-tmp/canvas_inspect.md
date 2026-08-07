---
name: canvas_inspect
old_tool: canvas_inspect
request_type: canvasInspect
description: "Report all Canvas components (renderMode / sortingOrder / GraphicRaycaster)."
category: ui-tmp
tags: [unity, canvas, ui]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.Reflection, UnityEngine.UI
try
{
    var canvases = UnityEngine.Object.FindObjectsByType<Canvas>(FindObjectsSortMode.None);
    var list = canvases.Select(c => new Dictionary<string, object>
    {
        ["name"] = c.name,
        ["renderMode"] = c.renderMode.ToString(),
        ["sortingOrder"] = c.sortingOrder,
        ["raycaster"] = c.GetComponent<GraphicRaycaster>() != null
    }).ToList();
    return new { success = true, count = canvases.Length, list };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
