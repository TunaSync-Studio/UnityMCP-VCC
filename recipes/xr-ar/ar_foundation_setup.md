---
name: ar_foundation_setup
old_tool: ar_foundation_setup
request_type: arFoundationSetup
description: "ARSession detect"
category: xr-ar
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
try { var arType = FindType("UnityEngine.XR.ARFoundation.ARSession"); return new { success = true, arFoundationInstalled = arType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
