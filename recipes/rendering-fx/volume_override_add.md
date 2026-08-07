---
name: volume_override_add
old_tool: volume_override_add
request_type: volumeOverrideAdd
description: "UnityEngine.Rendering.Volume count"
category: rendering-fx
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Build
// --- injected helper shims (from Phase11BHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try { var volumeType = FindType("UnityEngine.Rendering.Volume"); int count = volumeType != null ? UnityEngine.Object.FindObjectsByType(volumeType, FindObjectsSortMode.None).Length : 0; return new { success = true, volumeCount = count }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
