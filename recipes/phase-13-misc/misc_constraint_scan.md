---
name: misc_constraint_scan
old_tool: misc_constraint_scan
request_type: miscConstraintScan
description: "Phase 13 / misc / MiscConstraintScan"
category: phase-13-misc
tags: [unity, phase13]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations, UnityEditor.SceneManagement, UnityEngine.UI
try { int count = 0; foreach (var c in UnityEngine.Object.FindObjectsByType<Component>(FindObjectsSortMode.None)) { if (c == null) continue; if (c.GetType().Name.StartsWith("VRC") && c.GetType().Name.Contains("Constraint")) count++; } return new { success = true, vrcConstraintCount = count }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
