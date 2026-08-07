---
name: vrc_world_camera_setup
old_tool: vrc_world_camera_setup
request_type: vrcWorldCameraSetup
description: "Verify/create VRCSceneDescriptor.ReferenceCamera. action=report (default) / create (create new GameObject + Camera + assign)."
category: vrchat-world
tags: [vrchat, camera, world]
params:
  - {name: action, type: string, required: false, desc: "enum: report|create"}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.Reflection
// --- injected helper shims (from VRCWorldExtHandler.cs) ---
Type FindType(string name) {
            foreach (var a in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type[] types; try { types = a.GetTypes(); } catch { continue; }
                var t = types.FirstOrDefault(x => x.Name == name || x.FullName == name);
                if (t != null) return t;
            }
            return null;
        }
// --- end shims ---
try
{
    var sceneDescType = FindType("VRCSceneDescriptor");
    if (sceneDescType == null) { return new { success = false, error = "VRCSceneDescriptor not found" };  }

    var desc = UnityEngine.Object.FindFirstObjectByType(sceneDescType) as Component;
    if (desc == null) { return new { success = false, error = "no VRCSceneDescriptor in scene" };  }

    var refCamField = sceneDescType.GetField("ReferenceCamera");
    var currentCam = refCamField?.GetValue(desc) as GameObject;

    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string action = argd != null && argd.TryGetValue("action", out var a) ? a?.ToString() : "report";
    bool created = false;
    if (action == "create" && currentCam == null)
    {
        var camGo = new GameObject("Reference Camera");
        Undo.RegisterCreatedObjectUndo(camGo, "MCP camera setup");
        camGo.AddComponent<Camera>();
        refCamField?.SetValue(desc, camGo);
        EditorUtility.SetDirty(desc);
        created = true;
        currentCam = camGo;
    }

    return new
    {
        success = true,
        sceneDescriptor = desc.name,
        referenceCameraAssigned = currentCam != null,
        referenceCameraName = currentCam != null ? currentCam.name : null,
        created
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
