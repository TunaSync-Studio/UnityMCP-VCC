---
name: anim_parameter_rename
old_tool: anim_parameter_rename
request_type: animParameterRename
description: "Phase 13 / anim / AnimParameterRename"
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
AnimatorController LoadAC(string p) => AssetDatabase.LoadAssetAtPath<AnimatorController>(p);
// --- end shims ---
try { var a = Args(); var ac = LoadAC(GetS(a, "controllerPath")); var oldN = GetS(a, "oldName"); var newN = GetS(a, "newName"); if (ac == null || string.IsNullOrEmpty(oldN) || string.IsNullOrEmpty(newN)) { return new { success = false, error = "args required" };  } var ps = ac.parameters; foreach (var p in ps) if (p.name == oldN) p.name = newN; ac.parameters = ps; EditorUtility.SetDirty(ac); AssetDatabase.SaveAssets(); return new { success = true, oldName = oldN, newName = newN }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
