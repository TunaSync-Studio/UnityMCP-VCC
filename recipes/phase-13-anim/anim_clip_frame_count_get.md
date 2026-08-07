---
name: anim_clip_frame_count_get
old_tool: anim_clip_frame_count_get
request_type: animClipFrameCountGet
description: "Phase 13 / anim / AnimClipFrameCountGet"
category: phase-13-anim
tags: [unity, phase13]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations, UnityEditor.SceneManagement, UnityEngine.UI
// --- injected helper shims (from Phase20RealHandler.cs) ---
Dictionary<string, object> Args() { try { return args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); } catch { return new Dictionary<string, object>(); } }
string GetS(Dictionary<string, object> a, string k) { if (a != null && a.TryGetValue(k, out var v) && v != null) return v.ToString(); return null; }
AnimationClip LoadClip(string p) => AssetDatabase.LoadAssetAtPath<AnimationClip>(p);
// --- end shims ---
try { var a = Args(); var c = LoadClip(GetS(a, "clipPath")); if (c == null) { return new { success = false, error = "clip not found" };  } return new { success = true, frames = (int)(c.length * c.frameRate) }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
