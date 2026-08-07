---
name: anim_parameter_default_set
old_tool: anim_parameter_default_set
request_type: animParameterDefaultSet
description: "Phase 13 / anim / AnimParameterDefaultSet"
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
bool GetB(Dictionary<string, object> a, string k, bool def = false) { var s = GetS(a, k); if (s != null && bool.TryParse(s, out var b)) return b; return def; }
float GetF(Dictionary<string, object> a, string k, float def = 0) { var s = GetS(a, k); if (s != null && float.TryParse(s, out var f)) return f; return def; }
int GetI(Dictionary<string, object> a, string k, int def = 0) { var s = GetS(a, k); if (s != null && int.TryParse(s, out var i)) return i; return def; }
string GetS(Dictionary<string, object> a, string k) { if (a != null && a.TryGetValue(k, out var v) && v != null) return v.ToString(); return null; }
AnimatorController LoadAC(string p) => AssetDatabase.LoadAssetAtPath<AnimatorController>(p);
// --- end shims ---
try { var a = Args(); var ac = LoadAC(GetS(a, "controllerPath")); var name = GetS(a, "name"); if (ac == null || string.IsNullOrEmpty(name)) { return new { success = false, error = "args required" };  } var p = ac.parameters.FirstOrDefault(x => x.name == name); if (p == null) { return new { success = false, error = "parameter not found" };  } if (p.type == AnimatorControllerParameterType.Float) p.defaultFloat = GetF(a, "value"); else if (p.type == AnimatorControllerParameterType.Int) p.defaultInt = GetI(a, "value"); else if (p.type == AnimatorControllerParameterType.Bool) p.defaultBool = GetB(a, "value"); EditorUtility.SetDirty(ac); AssetDatabase.SaveAssets(); return new { success = true, name, type = p.type.ToString() }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
