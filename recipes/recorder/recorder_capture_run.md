---
name: recorder_capture_run
old_tool: recorder_capture_run
request_type: recorderCaptureRun
description: "RecorderController availability"
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
try { var recType = FindType("UnityEditor.Recorder.RecorderController"); return new { success = true, recorderControllerAvailable = recType != null, note = "Use Recorder window to start/stop capture." }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
