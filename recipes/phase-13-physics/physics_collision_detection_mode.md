---
name: physics_collision_detection_mode
old_tool: physics_collision_detection_mode
request_type: physicsCollisionDetectionMode
description: "Phase 13 / physics / PhysicsCollisionDetectionMode"
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
try { var a = Args(); var go = Resolve(GetS(a, "targetName")); if (go == null) { return new { success = false, error = "target required" };  } var rb = go.GetComponent<Rigidbody>(); if (rb == null) { return new { success = false, error = "no Rigidbody" };  } var mode = GetS(a, "mode") ?? "Discrete"; if (Enum.TryParse<CollisionDetectionMode>(mode, out var cdm)) { Undo.RecordObject(rb, "MCP CDM"); rb.collisionDetectionMode = cdm; } return new { success = true, mode = rb.collisionDetectionMode.ToString() }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
