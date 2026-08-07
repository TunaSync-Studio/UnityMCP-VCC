---
name: gizmo_visibility_toggle
old_tool: gizmo_visibility_toggle
request_type: gizmoVisibilityToggle
description: "Toggle SceneView.drawGizmos."
category: sceneview
tags: [unity, gizmo, sceneview]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO
try
{
    var sv = SceneView.lastActiveSceneView;
    bool wasShown = sv != null && sv.drawGizmos;
    if (sv != null) sv.drawGizmos = !wasShown;
    return new { success = true, sceneViewActive = sv != null, drawGizmos = sv != null ? sv.drawGizmos : false };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
