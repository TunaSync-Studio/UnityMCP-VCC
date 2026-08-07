---
name: anim_transition_duration_set
old_tool: anim_transition_duration_set
request_type: animTransitionDurationSet
description: "Phase 13 / anim / AnimTransitionDurationSet"
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
float GetF(Dictionary<string, object> a, string k, float def = 0) { var s = GetS(a, k); if (s != null && float.TryParse(s, out var f)) return f; return def; }
string GetS(Dictionary<string, object> a, string k) { if (a != null && a.TryGetValue(k, out var v) && v != null) return v.ToString(); return null; }
AnimatorController LoadAC(string p) => AssetDatabase.LoadAssetAtPath<AnimatorController>(p);
// --- end shims ---
try { var a = Args(); var ac = LoadAC(GetS(a, "controllerPath")); var dur = GetF(a, "duration", 0.25f); if (ac == null) { return new { success = false, error = "controller not found" };  } int affected = 0; foreach (var l in ac.layers) foreach (var s in l.stateMachine.states) foreach (var tr in s.state.transitions) { tr.duration = dur; affected++; } EditorUtility.SetDirty(ac); AssetDatabase.SaveAssets(); return new { success = true, affected, duration = dur }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
