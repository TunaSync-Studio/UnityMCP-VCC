---
name: anim_anim_event_list
old_tool: anim_anim_event_list
request_type: animAnimEventList
description: "Phase 13 / anim / AnimAnimEventList"
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
// alias: HandleAnimAnimEventList delegates to HandleAnimEventList in legacy code
// --- injected helper shims (from Phase20RealHandler.cs) ---
Dictionary<string, object> Args() { try { return args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); } catch { return new Dictionary<string, object>(); } }
string GetS(Dictionary<string, object> a, string k) { if (a != null && a.TryGetValue(k, out var v) && v != null) return v.ToString(); return null; }
AnimationClip LoadClip(string p) => AssetDatabase.LoadAssetAtPath<AnimationClip>(p);
// --- end shims ---
try { var a = Args(); var c = LoadClip(GetS(a, "clipPath")); if (c == null) { return new { success = false, error = "clip not found" };  } var evs = c.events.Select(e => new { e.time, e.functionName, e.stringParameter, e.floatParameter, e.intParameter }).ToList(); return new { success = true, count = evs.Count, events = evs }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
