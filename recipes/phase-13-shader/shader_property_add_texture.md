---
name: shader_property_add_texture
old_tool: shader_property_add_texture
request_type: shaderPropertyAddTexture
description: "Phase 13 / shader / ShaderPropertyAddTexture"
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
string GetS(Dictionary<string, object> a, string k) { if (a != null && a.TryGetValue(k, out var v) && v != null) return v.ToString(); return null; }
Material LoadMat(string p) => AssetDatabase.LoadAssetAtPath<Material>(p);
// --- end shims ---
try { var a = Args(); var p = GetS(a, "materialPath"); var n = GetS(a, "name"); var tp = GetS(a, "texturePath"); var m = LoadMat(p); var tex = string.IsNullOrEmpty(tp) ? null : AssetDatabase.LoadAssetAtPath<Texture>(tp); if (m == null || string.IsNullOrEmpty(n)) { return new { success = false, error = "materialPath + name required" };  } if (m.HasProperty(n)) { m.SetTexture(n, tex); EditorUtility.SetDirty(m); AssetDatabase.SaveAssets(); return new { success = true, texAssigned = tex != null }; } else return new { success = false, error = "property not found" }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
