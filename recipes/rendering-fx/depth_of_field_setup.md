---
name: depth_of_field_setup
old_tool: depth_of_field_setup
request_type: depthOfFieldSetup
description: "DepthOfField URP/HDRP detect"
category: rendering-fx
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Build
// --- injected helper shims (from Phase11BHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try { var dof = FindType("UnityEngine.Rendering.Universal.DepthOfField") ?? FindType("UnityEngine.Rendering.HighDefinition.DepthOfField"); return new { success = true, dofAvailable = dof != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
