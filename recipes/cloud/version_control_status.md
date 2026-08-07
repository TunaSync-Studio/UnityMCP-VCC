---
name: version_control_status
old_tool: version_control_status
request_type: versionControlStatus
description: "VCS Provider detect"
category: cloud
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
try { var vcsType = FindType("UnityEditor.VersionControl.Provider"); return new { success = true, vcsAvailable = vcsType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
