---
name: physics_interpolation_set
old_tool: physics_interpolation_set
request_type: physicsInterpolationSet
description: "Phase 13 / physics / PhysicsInterpolationSet"
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
string GetS(Dictionary<string, object> a, string k) { if (a != null && a.TryGetValue(k, out var v) && v != null) return v.ToString(); return null; }
GameObject Resolve(string n) { if (!string.IsNullOrEmpty(n)) { var g = GameObject.Find(n); if (g != null) return g; } return Selection.activeGameObject; }
// --- end shims ---
try { var a = Args(); var go = Resolve(GetS(a, "targetName")); if (go == null) { return new { success = false, error = "target required" };  } var rb = go.GetComponent<Rigidbody>(); if (rb == null) { return new { success = false, error = "no Rigidbody" };  } var mode = GetS(a, "mode") ?? "None"; if (Enum.TryParse<RigidbodyInterpolation>(mode, out var rim)) { Undo.RecordObject(rb, "MCP interp"); rb.interpolation = rim; } return new { success = true, interpolation = rb.interpolation.ToString() }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
