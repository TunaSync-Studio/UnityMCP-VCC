---
name: physics_center_of_mass_set
old_tool: physics_center_of_mass_set
request_type: physicsCenterOfMassSet
description: "Phase 13 / physics / PhysicsCenterOfMassSet"
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
try { var a = Args(); var go = Resolve(GetS(a, "targetName")); var arr = a.TryGetValue("center", out var cv) ? cv as Newtonsoft.Json.Linq.JArray : null; if (go == null) { return new { success = false, error = "target required" };  } var rb = go.GetComponent<Rigidbody>(); if (rb == null || arr == null || arr.Count != 3) { return new { success = false, error = "Rigidbody + center[x,y,z] required" };  } Undo.RecordObject(rb, "MCP COM"); rb.centerOfMass = new Vector3(arr[0].ToObject<float>(), arr[1].ToObject<float>(), arr[2].ToObject<float>()); return new { success = true, centerOfMass = new[] { rb.centerOfMass.x, rb.centerOfMass.y, rb.centerOfMass.z } }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
