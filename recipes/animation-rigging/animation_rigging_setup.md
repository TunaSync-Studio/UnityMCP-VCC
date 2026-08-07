---
name: animation_rigging_setup
old_tool: animation_rigging_setup
request_type: animationRiggingSetup
description: "RigBuilder detect"
category: animation-rigging
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
try { var argType = FindType("UnityEngine.Animations.Rigging.RigBuilder"); return new { success = true, animationRiggingAvailable = argType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
