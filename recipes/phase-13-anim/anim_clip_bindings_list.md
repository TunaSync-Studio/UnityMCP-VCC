---
name: anim_clip_bindings_list
old_tool: anim_clip_bindings_list
request_type: animClipBindingsList
description: "Phase 13 / anim / AnimClipBindingsList"
category: phase-13-anim
tags: [unity, phase13]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations, UnityEngine.UI
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string clipPath = argd?.TryGetValue("clipPath", out var cp) == true ? cp?.ToString() : null;
    if (string.IsNullOrEmpty(clipPath)) { return new { success = false, error = "clipPath required" };  }
    var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(clipPath);
    if (clip == null) { return new { success = false, error = "clip not found" };  }
    var bindings = AnimationUtility.GetCurveBindings(clip).Select(b => new Dictionary<string, object>
    {
        ["path"] = b.path,
        ["type"] = b.type.Name,
        ["propertyName"] = b.propertyName
    }).ToList();
    return new { success = true, clipPath, bindingCount = bindings.Count, bindings = bindings.Take(200).ToList() };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
