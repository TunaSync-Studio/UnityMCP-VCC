---
name: hdrp_volume_inspect
old_tool: hdrp_volume_inspect
request_type: hdrpVolumeInspect
description: "HDRenderPipeline detect"
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
try { var hdrpType = FindType("UnityEngine.Rendering.HighDefinition.HDRenderPipeline"); return new { success = true, hdrpInstalled = hdrpType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
