---
name: build_define_symbols_remove
old_tool: build_define_symbols_remove
request_type: buildDefineSymbolsRemove
description: "Phase 13 / build / BuildDefineSymbolsRemove"
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
try { var a = Args(); var sym = GetS(a, "symbol"); var current = PlayerSettings.GetScriptingDefineSymbols(UnityEditor.Build.NamedBuildTarget.Standalone); var list = current.Split(';').Where(s => !string.IsNullOrEmpty(s) && s != sym).ToList(); PlayerSettings.SetScriptingDefineSymbols(UnityEditor.Build.NamedBuildTarget.Standalone, string.Join(";", list)); return new { success = true, symbols = list }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
