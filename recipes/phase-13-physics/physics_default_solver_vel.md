---
name: physics_default_solver_vel
old_tool: physics_default_solver_vel
request_type: physicsDefaultSolverVel
description: "Phase 13 / physics / PhysicsDefaultSolverVel"
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
int GetI(Dictionary<string, object> a, string k, int def = 0) { var s = GetS(a, k); if (s != null && int.TryParse(s, out var i)) return i; return def; }
string GetS(Dictionary<string, object> a, string k) { if (a != null && a.TryGetValue(k, out var v) && v != null) return v.ToString(); return null; }
// --- end shims ---
try { var a = Args(); Physics.defaultSolverVelocityIterations = GetI(a, "value", 1); return new { success = true, defaultSolverVelocityIterations = Physics.defaultSolverVelocityIterations }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
