---
name: urp_post_process_data
old_tool: urp_post_process_data
request_type: urpPostProcessData
description: "URP PostProcessData detect"
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
try { var ppdType = FindType("UnityEngine.Rendering.Universal.PostProcessData"); return new { success = true, postProcessDataAvailable = ppdType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
