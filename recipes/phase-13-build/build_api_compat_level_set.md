---
name: build_api_compat_level_set
old_tool: build_api_compat_level_set
request_type: buildApiCompatLevelSet
description: "Phase 13 / build / BuildApiCompatLevelSet"
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
try { var a = Args(); var lvl = GetS(a, "level") ?? "NET_Standard"; if (Enum.TryParse<ApiCompatibilityLevel>(lvl, out var al)) PlayerSettings.SetApiCompatibilityLevel(UnityEditor.Build.NamedBuildTarget.Standalone, al); return new { success = true, currentLevel = PlayerSettings.GetApiCompatibilityLevel(UnityEditor.Build.NamedBuildTarget.Standalone).ToString() }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
