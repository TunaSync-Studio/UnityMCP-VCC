---
name: shader_property_add_float
old_tool: shader_property_add_float
request_type: shaderPropertyAddFloat
description: "Phase 13 / shader / ShaderPropertyAddFloat"
category: phase-13-shader
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
Material LoadMat(string p) => AssetDatabase.LoadAssetAtPath<Material>(p);
// --- end shims ---
try { var a = Args(); var p = GetS(a, "materialPath"); var n = GetS(a, "name"); var v = GetF(a, "value"); var m = LoadMat(p); if (m == null || string.IsNullOrEmpty(n)) { return new { success = false, error = "materialPath + name required" };  } if (m.HasProperty(n)) { m.SetFloat(n, v); EditorUtility.SetDirty(m); AssetDatabase.SaveAssets(); return new { success = true, materialPath = p, name = n, value = v }; } else return new { success = false, error = $"property {n} not found in shader {m.shader.name}" }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
