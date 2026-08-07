---
name: xr_interactor_setup
old_tool: xr_interactor_setup
request_type: xrInteractorSetup
description: "XR Interaction Toolkit detect"
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
try { var ixType = FindType("UnityEngine.XR.Interaction.Toolkit.Interactors.NearFarInteractor") ?? FindType("UnityEngine.XR.Interaction.Toolkit.XRRayInteractor"); return new { success = true, xrInteractionToolkitAvailable = ixType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
