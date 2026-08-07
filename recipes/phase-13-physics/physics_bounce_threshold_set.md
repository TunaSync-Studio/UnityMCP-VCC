---
name: physics_bounce_threshold_set
old_tool: physics_bounce_threshold_set
request_type: physicsBounceThresholdSet
description: "Phase 13 / physics / PhysicsBounceThresholdSet"
category: phase-13-physics
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
float GetF(Dictionary<string, object> a, string k, float def = 0) { var s = GetS(a, k); if (s != null && float.TryParse(s, out var f)) return f; return def; }
string GetS(Dictionary<string, object> a, string k) { if (a != null && a.TryGetValue(k, out var v) && v != null) return v.ToString(); return null; }
// --- end shims ---
try { var a = Args(); Physics.bounceThreshold = GetF(a, "value", 2f); return new { success = true, bounceThreshold = Physics.bounceThreshold }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
