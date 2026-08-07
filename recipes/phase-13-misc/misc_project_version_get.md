---
name: misc_project_version_get
old_tool: misc_project_version_get
request_type: miscProjectVersionGet
description: "Phase 13 / misc / MiscProjectVersionGet"
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
try { return new { success = true, version = PlayerSettings.bundleVersion, productName = PlayerSettings.productName, companyName = PlayerSettings.companyName }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
