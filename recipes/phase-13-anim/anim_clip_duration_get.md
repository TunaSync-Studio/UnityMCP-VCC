---
name: anim_clip_duration_get
old_tool: anim_clip_duration_get
request_type: animClipDurationGet
description: "Phase 13 / anim / AnimClipDurationGet"
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
    return new { success = true, clipPath, length = clip.length, frameRate = clip.frameRate, frameCount = (int)(clip.length * clip.frameRate), isLooping = clip.isLooping };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
