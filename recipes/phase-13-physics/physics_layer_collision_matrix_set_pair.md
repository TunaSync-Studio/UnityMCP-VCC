---
name: physics_layer_collision_matrix_set_pair
old_tool: physics_layer_collision_matrix_set_pair
request_type: physicsLayerCollisionMatrixSetPair
description: "Phase 13 / physics / PhysicsLayerCollisionMatrixSetPair"
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
bool GetB(Dictionary<string, object> a, string k, bool def = false) { var s = GetS(a, k); if (s != null && bool.TryParse(s, out var b)) return b; return def; }
int GetI(Dictionary<string, object> a, string k, int def = 0) { var s = GetS(a, k); if (s != null && int.TryParse(s, out var i)) return i; return def; }
string GetS(Dictionary<string, object> a, string k) { if (a != null && a.TryGetValue(k, out var v) && v != null) return v.ToString(); return null; }
// --- end shims ---
try { var a = Args(); int la = GetI(a, "layerA"); int lb = GetI(a, "layerB"); bool ignore = GetB(a, "ignore"); Physics.IgnoreLayerCollision(la, lb, ignore); return new { success = true, layerA = la, layerB = lb, ignore }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
