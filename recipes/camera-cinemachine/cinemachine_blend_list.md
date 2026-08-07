---
name: cinemachine_blend_list
old_tool: cinemachine_blend_list
request_type: cinemachineBlendList
description: "CinemachineBlendListCamera count"
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
try { var blendListType = FindType("CinemachineBlendListCamera"); int count = blendListType != null ? UnityEngine.Object.FindObjectsByType(blendListType, FindObjectsSortMode.None).Length : 0; return new { success = true, blendListCameraCount = count }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
