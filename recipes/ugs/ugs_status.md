---
name: ugs_status
old_tool: ugs_status
request_type: ugsStatus
description: "Unity Services Core detect"
category: ugs
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEngine.Tilemaps, UnityEngine.U2D
// --- injected helper shims (from Phase11EHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try { var ugsType = FindType("Unity.Services.Core.UnityServices"); return new { success = true, unityServicesCoreInstalled = ugsType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
