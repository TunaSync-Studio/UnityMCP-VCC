---
name: anim_clip_curve_export
old_tool: anim_clip_curve_export
request_type: animClipCurveExport
description: "Phase 13 / anim / AnimClipCurveExport"
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
string GetS(Dictionary<string, object> a, string k) { if (a != null && a.TryGetValue(k, out var v) && v != null) return v.ToString(); return null; }
AnimationClip LoadClip(string p) => AssetDatabase.LoadAssetAtPath<AnimationClip>(p);
// --- end shims ---
try { var a = Args(); var c = LoadClip(GetS(a, "clipPath")); var op = GetS(a, "outputPath"); if (c == null || string.IsNullOrEmpty(op)) { return new { success = false, error = "clipPath + outputPath required" };  } var bindings = AnimationUtility.GetCurveBindings(c).Select(b => new { b.path, type = b.type.Name, b.propertyName }).ToList(); Directory.CreateDirectory(Path.GetDirectoryName(op)); File.WriteAllText(op, JsonConvert.SerializeObject(bindings, Formatting.Indented)); return new { success = true, outputPath = op, count = bindings.Count }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
