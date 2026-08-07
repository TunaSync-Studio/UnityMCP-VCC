---
name: cinemachine_noise_profile
old_tool: cinemachine_noise_profile
request_type: cinemachineNoiseProfile
description: "CinemachineBasicMultiChannelPerlin count"
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
try { var noise = FindType("CinemachineBasicMultiChannelPerlin"); int count = noise != null ? UnityEngine.Object.FindObjectsByType(noise, FindObjectsSortMode.None).Length : 0; return new { success = true, perlinNoiseComponentCount = count }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
