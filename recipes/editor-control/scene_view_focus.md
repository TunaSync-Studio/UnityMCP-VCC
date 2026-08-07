---
name: scene_view_focus
old_tool: scene_view_focus
request_type: sceneViewFocus
description: "Frame Scene View on the target GameObject (FrameSelected on Selection.activeGameObject)."
category: editor-control
tags: [unity, scene-view, focus, frame]
params:
  - {name: targetName, type: string, required: false, desc: "Defaults to current Selection"}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string targetName = argd != null && argd.TryGetValue("targetName", out var tn) && tn != null ? tn.ToString() : null;

    GameObject target = null;
    if (!string.IsNullOrEmpty(targetName)) target = GameObject.Find(targetName);
    if (target == null) target = Selection.activeGameObject;
    if (target == null) { return new { success = false, error = "target GameObject not found" };  }

    Selection.activeGameObject = target;
    var sv = SceneView.lastActiveSceneView;
    if (sv != null) sv.FrameSelected();

    return new
    {
        success = true,
        target = target.name,
        sceneViewActive = sv != null
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
