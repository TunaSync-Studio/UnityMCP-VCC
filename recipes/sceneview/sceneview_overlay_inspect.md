---
name: sceneview_overlay_inspect
old_tool: sceneview_overlay_inspect
request_type: sceneViewOverlayInspect
description: "Report SceneView state (in2D / drawGizmos / camera fov / farClip)."
category: sceneview
tags: [unity, sceneview]
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
    return new
    {
        success = true,
        sceneViewActive = sv != null,
        inGameView = sv != null ? sv.in2DMode : false,
        drawGizmos = sv != null ? sv.drawGizmos : false,
        cameraSettings = sv != null ? new { sv.camera.fieldOfView, sv.camera.farClipPlane } : null
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
