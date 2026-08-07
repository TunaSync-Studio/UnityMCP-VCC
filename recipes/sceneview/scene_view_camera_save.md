---
name: scene_view_camera_save
old_tool: scene_view_camera_save
request_type: sceneViewCameraSave
description: "SceneView pivot/rotation save to SessionState"
category: sceneview
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.SceneManagement
try { var sv = SceneView.lastActiveSceneView; if (sv == null) { return new { success = false, error = "no active SceneView" };  } var pos = sv.pivot; var rot = sv.rotation; SessionState.SetVector3("MCP.SVPivot", pos); SessionState.SetVector3("MCP.SVRot", rot.eulerAngles); return new { success = true, pivot = new[] { pos.x, pos.y, pos.z } }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
