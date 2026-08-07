---
name: physics_physics_auto_sync
old_tool: physics_physics_auto_sync
request_type: physicsPhysicsAutoSync
description: "Phase 13 / physics / PhysicsPhysicsAutoSync"
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
// alias: HandlePhysicsPhysicsAutoSync delegates to HandlePhysicsAutoSync in legacy code
// --- injected helper shims (from Phase20RealHandler.cs) ---
Dictionary<string, object> Args() { try { return args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); } catch { return new Dictionary<string, object>(); } }
bool GetB(Dictionary<string, object> a, string k, bool def = false) { var s = GetS(a, k); if (s != null && bool.TryParse(s, out var b)) return b; return def; }
string GetS(Dictionary<string, object> a, string k) { if (a != null && a.TryGetValue(k, out var v) && v != null) return v.ToString(); return null; }
// --- end shims ---
try { var a = Args(); Physics.autoSyncTransforms = GetB(a, "value"); return new { success = true, autoSyncTransforms = Physics.autoSyncTransforms }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
