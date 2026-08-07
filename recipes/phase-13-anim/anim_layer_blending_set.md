---
name: anim_layer_blending_set
old_tool: anim_layer_blending_set
request_type: animLayerBlendingSet
description: "Phase 13 / anim / AnimLayerBlendingSet"
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
int GetI(Dictionary<string, object> a, string k, int def = 0) { var s = GetS(a, k); if (s != null && int.TryParse(s, out var i)) return i; return def; }
string GetS(Dictionary<string, object> a, string k) { if (a != null && a.TryGetValue(k, out var v) && v != null) return v.ToString(); return null; }
AnimatorController LoadAC(string p) => AssetDatabase.LoadAssetAtPath<AnimatorController>(p);
// --- end shims ---
try { var a = Args(); var ac = LoadAC(GetS(a, "controllerPath")); var idx = GetI(a, "layerIndex"); var blend = GetS(a, "blending") ?? "Override"; if (ac == null || idx >= ac.layers.Length) { return new { success = false, error = "args required" };  } var ls = ac.layers; if (Enum.TryParse<AnimatorLayerBlendingMode>(blend, out var bm)) ls[idx].blendingMode = bm; ac.layers = ls; EditorUtility.SetDirty(ac); AssetDatabase.SaveAssets(); return new { success = true, blending = blend }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
