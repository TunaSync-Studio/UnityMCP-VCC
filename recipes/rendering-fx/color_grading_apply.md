---
name: color_grading_apply
old_tool: color_grading_apply
request_type: colorGradingApply
description: "ColorAdjustments URP/HDRP detect"
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
try { var cgType = FindType("UnityEngine.Rendering.Universal.ColorAdjustments") ?? FindType("UnityEngine.Rendering.HighDefinition.ColorAdjustments"); return new { success = true, colorAdjustmentsAvailable = cgType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
