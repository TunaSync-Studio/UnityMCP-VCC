---
name: urp_universal_camera_data
old_tool: urp_universal_camera_data
request_type: urpUniversalCameraData
description: "UniversalAdditionalCameraData count"
category: rendering-urp
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from Phase11CHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try { var ucdType = FindType("UnityEngine.Rendering.Universal.UniversalAdditionalCameraData"); int count = ucdType != null ? UnityEngine.Object.FindObjectsByType(ucdType, FindObjectsSortMode.None).Length : 0; return new { success = true, cameraDataCount = count }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
