---
name: ar_foundation_anchor_inspect
old_tool: ar_foundation_anchor_inspect
request_type: arFoundationAnchorInspect
description: "ARAnchor count"
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
try { var anchorType = FindType("UnityEngine.XR.ARFoundation.ARAnchor"); int count = anchorType != null ? UnityEngine.Object.FindObjectsByType(anchorType, FindObjectsSortMode.None).Length : 0; return new { success = true, anchorCount = count }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
