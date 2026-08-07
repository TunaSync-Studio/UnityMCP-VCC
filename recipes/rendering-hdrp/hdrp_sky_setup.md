---
name: hdrp_sky_setup
old_tool: hdrp_sky_setup
request_type: hdrpSkySetup
description: "HDRISky / PhysicallyBasedSky detect"
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
try { var skyType = FindType("UnityEngine.Rendering.HighDefinition.HDRISky") ?? FindType("UnityEngine.Rendering.HighDefinition.PhysicallyBasedSky"); return new { success = true, hdrpSkyAvailable = skyType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
