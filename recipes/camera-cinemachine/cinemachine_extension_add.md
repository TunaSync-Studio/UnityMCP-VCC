---
name: cinemachine_extension_add
old_tool: cinemachine_extension_add
request_type: cinemachineExtensionAdd
description: "CinemachineExtension type detect"
category: camera-cinemachine
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations
// --- injected helper shims (from Phase11AHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try { var extType = FindType("CinemachineExtension"); return new { success = true, extensionTypeAvailable = extType != null, note = "Add via Cinemachine Inspector > Extensions menu." }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
