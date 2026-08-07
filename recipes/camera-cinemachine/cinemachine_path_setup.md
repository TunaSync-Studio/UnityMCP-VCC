---
name: cinemachine_path_setup
old_tool: cinemachine_path_setup
request_type: cinemachinePathSetup
description: "CinemachinePath / SmoothPath count"
category: camera-cinemachine
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations
// --- injected helper shims (from Phase11AHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try { var pathType = FindType("CinemachinePath") ?? FindType("CinemachineSmoothPath"); int count = pathType != null ? UnityEngine.Object.FindObjectsByType(pathType, FindObjectsSortMode.None).Length : 0; return new { success = true, pathCount = count }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
