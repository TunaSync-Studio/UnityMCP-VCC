---
name: build_stripping_level_set
old_tool: build_stripping_level_set
request_type: buildStrippingLevelSet
description: "Phase 13 / build / BuildStrippingLevelSet"
category: phase-13-build
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
try { var a = Args(); var lvl = GetS(a, "level") ?? "Disabled"; if (Enum.TryParse<ManagedStrippingLevel>(lvl, out var ml)) PlayerSettings.SetManagedStrippingLevel(UnityEditor.Build.NamedBuildTarget.Standalone, ml); return new { success = true, level = PlayerSettings.GetManagedStrippingLevel(UnityEditor.Build.NamedBuildTarget.Standalone).ToString() }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
