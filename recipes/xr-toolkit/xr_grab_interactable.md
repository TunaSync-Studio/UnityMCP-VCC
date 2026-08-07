---
name: xr_grab_interactable
old_tool: xr_grab_interactable
request_type: xrGrabInteractable
description: "XRGrabInteractable count"
category: xr-toolkit
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from Phase11DHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try { var grabType = FindType("UnityEngine.XR.Interaction.Toolkit.Interactables.XRGrabInteractable") ?? FindType("UnityEngine.XR.Interaction.Toolkit.XRGrabInteractable"); int count = grabType != null ? UnityEngine.Object.FindObjectsByType(grabType, FindObjectsSortMode.None).Length : 0; return new { success = true, grabInteractableCount = count }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
