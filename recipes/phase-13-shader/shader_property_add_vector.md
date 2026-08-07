---
name: shader_property_add_vector
old_tool: shader_property_add_vector
request_type: shaderPropertyAddVector
description: "Phase 13 / shader / ShaderPropertyAddVector"
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
try { var a = Args(); var p = GetS(a, "materialPath"); var n = GetS(a, "name"); var arr = a.TryGetValue("value", out var vv) ? vv as Newtonsoft.Json.Linq.JArray : null; var m = LoadMat(p); if (m == null || string.IsNullOrEmpty(n) || arr == null || arr.Count != 4) { return new { success = false, error = "materialPath + name + value[x,y,z,w] required" };  } if (m.HasProperty(n)) { m.SetVector(n, new Vector4(arr[0].ToObject<float>(), arr[1].ToObject<float>(), arr[2].ToObject<float>(), arr[3].ToObject<float>())); EditorUtility.SetDirty(m); AssetDatabase.SaveAssets(); return new { success = true }; } else return new { success = false, error = "property not found" }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
