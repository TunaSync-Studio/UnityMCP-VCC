---
name: shader_keyword_disable_all
old_tool: shader_keyword_disable_all
request_type: shaderKeywordDisableAll
description: "Phase 13 / shader / ShaderKeywordDisableAll"
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
try { var a = Args(); var keyword = GetS(a, "keyword"); var folder = GetS(a, "folder"); if (string.IsNullOrEmpty(keyword)) { return new { success = false, error = "keyword required" };  } var guids = AssetDatabase.FindAssets("t:Material", folder != null ? new[] { folder } : null); int affected = 0; foreach (var g in guids) { var m = LoadMat(AssetDatabase.GUIDToAssetPath(g)); if (m == null) continue; m.DisableKeyword(keyword); EditorUtility.SetDirty(m); affected++; } AssetDatabase.SaveAssets(); return new { success = true, affected }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
