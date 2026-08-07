---
name: prefab_apply_overrides
old_tool: prefab_apply_overrides
request_type: prefabApplyOverrides
description: "Apply prefab instance overrides back to the prefab asset (PrefabUtility.ApplyPrefabInstance)."
category: prefab
tags: [unity, prefab, apply]
params:
  - {name: instanceName, type: string, required: false, desc: "Defaults to Selection"}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Text.RegularExpressions
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string instanceName = argd != null && argd.TryGetValue("instanceName", out var inn) && inn != null ? inn.ToString() : null;

    GameObject instance = null;
    if (!string.IsNullOrEmpty(instanceName)) instance = GameObject.Find(instanceName);
    if (instance == null) instance = Selection.activeGameObject;
    if (instance == null) { return new { success = false, error = "instance not found" };  }

    if (!PrefabUtility.IsPartOfPrefabInstance(instance)) { return new { success = false, error = "not a prefab instance" };  }

    var prefabAssetPath = PrefabUtility.GetPrefabAssetPathOfNearestInstanceRoot(instance);
    PrefabUtility.ApplyPrefabInstance(instance, InteractionMode.UserAction);

    return new
    {
        success = true,
        instance = instance.name,
        appliedTo = prefabAssetPath
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
