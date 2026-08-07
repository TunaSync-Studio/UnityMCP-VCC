---
name: animator_override_apply
old_tool: animator_override_apply
request_type: animatorOverrideApply
description: "Apply AnimatorOverrideController to a target GameObject's Animator. Used for chimera expression swaps."
category: animation
tags: [unity, animator, override]
params:
  - {name: overridePath, type: string, required: true, desc: ""}
  - {name: targetGameObject, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, UnityEditor.Animations
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string overridePath = argd != null && argd.TryGetValue("overridePath", out var op) && op != null ? op.ToString() : null;
    string targetGoName = argd != null && argd.TryGetValue("targetGameObject", out var tg) && tg != null ? tg.ToString() : null;
    if (string.IsNullOrEmpty(overridePath)) { return new { success = false, error = "overridePath required" };  }

    var ovr = AssetDatabase.LoadAssetAtPath<AnimatorOverrideController>(overridePath);
    if (ovr == null) { return new { success = false, error = "AnimatorOverrideController not found" };  }

    GameObject target = null;
    if (!string.IsNullOrEmpty(targetGoName)) target = GameObject.Find(targetGoName);
    if (target == null) target = Selection.activeGameObject;
    if (target == null) { return new { success = false, error = "target GameObject not found" };  }

    var animator = target.GetComponent<Animator>();
    if (animator == null) { return new { success = false, error = "no Animator on target" };  }

    Undo.RecordObject(animator, "MCP override apply");
    animator.runtimeAnimatorController = ovr;

    return new
    {
        success = true,
        target = target.name,
        overrideController = ovr.name
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
