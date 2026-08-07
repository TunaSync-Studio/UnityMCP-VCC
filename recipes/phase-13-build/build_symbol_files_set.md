---
name: build_symbol_files_set
old_tool: build_symbol_files_set
request_type: buildSymbolFilesSet
description: "Phase 13 / build / BuildSymbolFilesSet"
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
bool GetB(Dictionary<string, object> a, string k, bool def = false) { var s = GetS(a, k); if (s != null && bool.TryParse(s, out var b)) return b; return def; }
string GetS(Dictionary<string, object> a, string k) { if (a != null && a.TryGetValue(k, out var v) && v != null) return v.ToString(); return null; }
// --- end shims ---
try { var a = Args(); var v = GetB(a, "create", true); EditorUserBuildSettings.symlinkSources = v; return new { success = true, symlinkSources = EditorUserBuildSettings.symlinkSources }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
