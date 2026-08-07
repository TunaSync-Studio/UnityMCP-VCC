---
name: hdrp_cloud_setup
old_tool: hdrp_cloud_setup
request_type: hdrpCloudSetup
description: "VolumetricClouds detect"
category: rendering-hdrp
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
try { var cloudType = FindType("UnityEngine.Rendering.HighDefinition.VolumetricClouds"); return new { success = true, hdrpCloudAvailable = cloudType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
