---
name: physics_drag_set
old_tool: physics_drag_set
request_type: physicsDragSet
description: "Phase 13 / physics / PhysicsDragSet"
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
GameObject Resolve(string n) { if (!string.IsNullOrEmpty(n)) { var g = GameObject.Find(n); if (g != null) return g; } return Selection.activeGameObject; }
// --- end shims ---
try { var a = Args(); var go = Resolve(GetS(a, "targetName")); var v = GetF(a, "value"); if (go == null) { return new { success = false, error = "target required" };  } var rb = go.GetComponent<Rigidbody>(); if (rb == null) { return new { success = false, error = "no Rigidbody" };  } Undo.RecordObject(rb, "MCP drag"); rb.drag = v; return new { success = true, drag = rb.drag }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
