---
name: animation_event_add
old_tool: animation_event_add
request_type: animationEventAdd
description: "Add AnimationEvent (functionName + time) to AnimationClip via AnimationUtility.SetAnimationEvents."
category: animation
tags: [unity, animation, event]
params:
  - {name: clipPath, type: string, required: true, desc: ""}
  - {name: functionName, type: string, required: true, desc: ""}
  - {name: time, type: number, required: false, desc: ""}
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
    string clipPath = argd?.TryGetValue("clipPath", out var cp) == true ? cp?.ToString() : null;
    string functionName = argd?.TryGetValue("functionName", out var fn) == true ? fn?.ToString() : null;
    float time = argd?.TryGetValue("time", out var tv) == true && float.TryParse(tv?.ToString(), out var tf) ? tf : 0f;
    if (string.IsNullOrEmpty(clipPath) || string.IsNullOrEmpty(functionName)) { return new { success = false, error = "clipPath + functionName required" };  }

    var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(clipPath);
    if (clip == null) { return new { success = false, error = "clip not found" };  }

    var events = clip.events.ToList();
    events.Add(new AnimationEvent { time = time, functionName = functionName });
    AnimationUtility.SetAnimationEvents(clip, events.ToArray());
    EditorUtility.SetDirty(clip);
    AssetDatabase.SaveAssets();

    return new { success = true, clipPath, functionName, time, totalEvents = events.Count };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
