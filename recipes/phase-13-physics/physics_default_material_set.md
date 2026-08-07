---
name: physics_default_material_set
old_tool: physics_default_material_set
request_type: physicsDefaultMaterialSet
description: "Phase 13 / physics / PhysicsDefaultMaterialSet"
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
try { var a = Args(); var p = GetS(a, "materialPath"); var pm = string.IsNullOrEmpty(p) ? null : AssetDatabase.LoadAssetAtPath<PhysicMaterial>(p); Physics.defaultContactOffset = GetF(a, "contactOffset", 0.01f); return new { success = true, contactOffset = Physics.defaultContactOffset, materialAssigned = pm != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
