---
name: anim_root_motion_set
old_tool: anim_root_motion_set
request_type: animRootMotionSet
description: "Phase 13 / anim / AnimRootMotionSet"
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
bool GetB(Dictionary<string, object> a, string k, bool def = false) { var s = GetS(a, k); if (s != null && bool.TryParse(s, out var b)) return b; return def; }
string GetS(Dictionary<string, object> a, string k) { if (a != null && a.TryGetValue(k, out var v) && v != null) return v.ToString(); return null; }
GameObject Resolve(string n) { if (!string.IsNullOrEmpty(n)) { var g = GameObject.Find(n); if (g != null) return g; } return Selection.activeGameObject; }
// --- end shims ---
try { var a = Args(); var go = Resolve(GetS(a, "targetName")); var apply = GetB(a, "applyRootMotion"); if (go == null) { return new { success = false, error = "target required" };  } var anim = go.GetComponent<Animator>(); if (anim == null) { return new { success = false, error = "no Animator" };  } Undo.RecordObject(anim, "MCP root motion"); anim.applyRootMotion = apply; return new { success = true, applyRootMotion = anim.applyRootMotion }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
