---
name: mesh_normal_offset_fix
old_tool: mesh_normal_offset_fix
request_type: meshNormalOffsetFix
description: "Apply forward-axis position offset (default +0.005m) to all Renderer transforms under a root GameObject. Fixes Z-fighting on coplanar surfaces (e.g. wall photos flickering when camera moves). stagger=true adds +0.001m per index for adjacent overlap. Undoable via Edit > Undo."
category: scene-repair
tags: [unity, z-fighting, offset, renderer, vrchat-world]
params:
  - {name: rootName, type: string, required: false, desc: "GameObject.Find target (defaults to Selection)"}
  - {name: offset, type: number, required: false, desc: ""}
  - {name: axis, type: string, required: false, desc: "enum: forward|back|up|down|right|left"}
  - {name: stagger, type: boolean, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, UnityEditor.SceneManagement
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string rootName = argd != null && argd.TryGetValue("rootName", out var rn) && rn != null ? rn.ToString() : null;
    float offset = 0.005f;
    if (argd != null && argd.TryGetValue("offset", out var o) && o != null) float.TryParse(o.ToString(), out offset);
    string axis = argd != null && argd.TryGetValue("axis", out var ax) && ax != null ? ax.ToString() : "forward";
    bool stagger = argd != null && argd.TryGetValue("stagger", out var stg) && stg != null && bool.TryParse(stg.ToString(), out var stgB) && stgB;
    float staggerStep = 0.001f;

    GameObject root = null;
    if (!string.IsNullOrEmpty(rootName)) root = GameObject.Find(rootName);
    if (root == null && Selection.activeGameObject != null) root = Selection.activeGameObject;
    if (root == null)
    {
        return new { success = false, error = "rootName arg or Selection required" };

    }

    var transforms = root.GetComponentsInChildren<Renderer>(true).Select(r => r.transform).Distinct().ToList();
    int adjusted = 0;
    int idx = 0;
    foreach (var t in transforms)
    {
        Vector3 dir;
        switch (axis)
        {
            case "up": dir = t.up; break;
            case "right": dir = t.right; break;
            case "back": dir = -t.forward; break;
            case "down": dir = -t.up; break;
            case "left": dir = -t.right; break;
            default: dir = t.forward; break;
        }
        Undo.RecordObject(t, "MCP Z-fight offset");
        float thisOffset = offset + (stagger ? idx * staggerStep : 0f);
        t.position += dir.normalized * thisOffset;
        adjusted++;
        idx++;
    }
    EditorSceneManager.MarkSceneDirty(EditorSceneManager.GetActiveScene());

    return new
    {
        success = true,
        rootName = root.name,
        adjusted,
        offset,
        axis,
        stagger,
        note = "Use Edit > Undo to revert."
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
