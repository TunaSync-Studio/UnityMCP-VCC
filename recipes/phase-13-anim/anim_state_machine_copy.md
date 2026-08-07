---
name: anim_state_machine_copy
old_tool: anim_state_machine_copy
request_type: animStateMachineCopy
description: "Phase 13 / anim / AnimStateMachineCopy"
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
// --- end shims ---
try { var a = Args(); var fp = GetS(a, "fromPath"); var tp = GetS(a, "toPath"); if (string.IsNullOrEmpty(fp) || string.IsNullOrEmpty(tp)) { return new { success = false, error = "fromPath + toPath required" };  } var ok = AssetDatabase.CopyAsset(fp, tp); return new { success = ok, fromPath = fp, toPath = tp }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
