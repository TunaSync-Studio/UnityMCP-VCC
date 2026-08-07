---
name: cinemachine_camera_setup
old_tool: cinemachine_camera_setup
request_type: cinemachineCameraSetup
description: "Add CinemachineBrain to Camera.main + create CinemachineVirtualCamera GameObject."
category: camera-cinemachine
tags: [unity, cinemachine]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
try
{
    var cinemachineType = AppDomain.CurrentDomain.GetAssemblies()
        .SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } })
        .FirstOrDefault(tt => tt.Name == "CinemachineVirtualCamera" || tt.Name == "CinemachineCamera");
    if (cinemachineType == null) { return new { success = false, error = "Cinemachine type not found" };  }

    var brainType = AppDomain.CurrentDomain.GetAssemblies()
        .SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } })
        .FirstOrDefault(tt => tt.Name == "CinemachineBrain");

    var mainCam = Camera.main;
    if (mainCam != null && brainType != null && mainCam.GetComponent(brainType) == null)
    {
        Undo.AddComponent(mainCam.gameObject, brainType);
    }

    var go = new GameObject("CM Virtual Camera");
    Undo.RegisterCreatedObjectUndo(go, "MCP Cinemachine setup");
    Undo.AddComponent(go, cinemachineType);

    return new { success = true, cameraName = go.name, brainAdded = mainCam != null };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
