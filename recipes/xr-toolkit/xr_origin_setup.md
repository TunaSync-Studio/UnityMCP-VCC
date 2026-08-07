---
name: xr_origin_setup
old_tool: xr_origin_setup
request_type: xrOriginSetup
description: "XROrigin count"
category: xr-toolkit
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
try { var xrType = FindType("Unity.XR.CoreUtils.XROrigin"); int count = xrType != null ? UnityEngine.Object.FindObjectsByType(xrType, FindObjectsSortMode.None).Length : 0; return new { success = true, xrOriginCount = count }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
