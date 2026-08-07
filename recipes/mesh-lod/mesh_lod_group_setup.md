---
name: mesh_lod_group_setup
old_tool: mesh_lod_group_setup
request_type: meshLodGroupSetup
description: "Add LODGroup component to target if missing. Returns lodCount + fadeMode."
category: mesh-lod
tags: [unity, lod]
params:
  - {name: targetName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string targetName = argd?.TryGetValue("targetName", out var tn) == true ? tn?.ToString() : null;
    GameObject target = !string.IsNullOrEmpty(targetName) ? GameObject.Find(targetName) : Selection.activeGameObject;
    if (target == null) { return new { success = false, error = "target required" };  }

    var lodGroup = target.GetComponent<LODGroup>();
    bool added = false;
    if (lodGroup == null) { lodGroup = Undo.AddComponent<LODGroup>(target); added = true; }

    return new
    {
        success = true,
        target = target.name,
        added,
        lodCount = lodGroup.lodCount,
        fadeMode = lodGroup.fadeMode.ToString()
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
