---
name: spline_create
old_tool: spline_create
request_type: splineCreate
description: "Unity Splines package detect"
category: splines
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
try { var splineType = FindType("UnityEngine.Splines.SplineContainer"); return new { success = true, splinesPackageAvailable = splineType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
