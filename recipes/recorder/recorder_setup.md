---
name: recorder_setup
old_tool: recorder_setup
request_type: recorderSetup
description: "Unity Recorder package detect"
category: recorder
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
try { var recType = FindType("UnityEditor.Recorder.RecorderWindow"); return new { success = true, recorderInstalled = recType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
