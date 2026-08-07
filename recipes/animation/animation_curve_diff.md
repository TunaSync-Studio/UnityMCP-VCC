---
name: animation_curve_diff
old_tool: animation_curve_diff
request_type: animationCurveDiff
description: "Compare 2 AnimationClips by curve binding (path::type::propertyName). Returns onlyA / onlyB / common bindings. Useful for chimera avatar reconciliation."
category: animation
tags: [unity, animation, diff]
params:
  - {name: clipA, type: string, required: true, desc: ""}
  - {name: clipB, type: string, required: true, desc: ""}
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
    string aPath = argd != null && argd.TryGetValue("clipA", out var a) && a != null ? a.ToString() : null;
    string bPath = argd != null && argd.TryGetValue("clipB", out var b) && b != null ? b.ToString() : null;
    if (string.IsNullOrEmpty(aPath) || string.IsNullOrEmpty(bPath)) { return new { success = false, error = "clipA + clipB required" };  }

    var clipA = AssetDatabase.LoadAssetAtPath<AnimationClip>(aPath);
    var clipB = AssetDatabase.LoadAssetAtPath<AnimationClip>(bPath);
    if (clipA == null || clipB == null) { return new { success = false, error = "clip not found" };  }

    var bindingsA = AnimationUtility.GetCurveBindings(clipA).Select(b => $"{b.path}::{b.type.Name}::{b.propertyName}").ToHashSet();
    var bindingsB = AnimationUtility.GetCurveBindings(clipB).Select(b => $"{b.path}::{b.type.Name}::{b.propertyName}").ToHashSet();

    var onlyA = bindingsA.Except(bindingsB).ToList();
    var onlyB = bindingsB.Except(bindingsA).ToList();
    var common = bindingsA.Intersect(bindingsB).ToList();

    return new
    {
        success = true,
        clipACount = bindingsA.Count,
        clipBCount = bindingsB.Count,
        commonCount = common.Count,
        onlyAInClip = onlyA,
        onlyBInClip = onlyB
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
