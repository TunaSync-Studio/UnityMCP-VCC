---
name: shader_cull_mode_set_batch
old_tool: shader_cull_mode_set_batch
request_type: shaderCullModeSetBatch
description: "Phase 13 / shader / ShaderCullModeSetBatch"
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
// alias: HandleShaderCullModeSetBatch delegates to HandleShaderBatchSetIntProperty in legacy code
// --- injected helper shims (from Phase20RealHandler.cs) ---
Dictionary<string, object> Args() { try { return args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); } catch { return new Dictionary<string, object>(); } }
int GetI(Dictionary<string, object> a, string k, int def = 0) { var s = GetS(a, k); if (s != null && int.TryParse(s, out var i)) return i; return def; }
string GetS(Dictionary<string, object> a, string k) { if (a != null && a.TryGetValue(k, out var v) && v != null) return v.ToString(); return null; }
Material LoadMat(string p) => AssetDatabase.LoadAssetAtPath<Material>(p);
// --- end shims ---
try { var a = Args(); var folder = GetS(a, "folder"); var name = GetS(a, "name"); var value = GetI(a, "value"); if (string.IsNullOrEmpty(name)) { return new { success = false, error = "name required" };  } var guids = AssetDatabase.FindAssets("t:Material", folder != null ? new[] { folder } : null); int affected = 0; foreach (var g in guids) { var m = LoadMat(AssetDatabase.GUIDToAssetPath(g)); if (m != null && m.HasProperty(name)) { m.SetInt(name, value); EditorUtility.SetDirty(m); affected++; } } AssetDatabase.SaveAssets(); return new { success = true, affected }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
