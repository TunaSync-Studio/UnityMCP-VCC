---
name: visual_script_inspect
old_tool: visual_script_inspect
request_type: visualScriptInspect
description: "ScriptMachine count"
category: visual-scripting
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from Phase11DHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try { var vsType = FindType("Unity.VisualScripting.ScriptMachine"); int count = vsType != null ? UnityEngine.Object.FindObjectsByType(vsType, FindObjectsSortMode.None).Length : 0; return new { success = true, visualScriptingAvailable = vsType != null, scriptMachineCount = count }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
