---
name: ui_button_event_inspect
old_tool: ui_button_event_inspect
request_type: uiButtonEventInspect
description: "List all Button components + onClick persistent listener count."
category: ui-tmp
tags: [unity, button, ui]
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
    var buttons = UnityEngine.Object.FindObjectsByType<Button>(FindObjectsSortMode.None);
    var list = buttons.Select(b => new Dictionary<string, object>
    {
        ["name"] = b.name,
        ["interactable"] = b.interactable,
        ["onClickListenerCount"] = b.onClick.GetPersistentEventCount()
    }).ToList();
    return new { success = true, count = buttons.Length, list };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
