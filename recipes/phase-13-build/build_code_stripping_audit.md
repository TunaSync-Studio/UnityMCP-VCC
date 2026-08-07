---
name: build_code_stripping_audit
old_tool: build_code_stripping_audit
request_type: buildCodeStrippingAudit
description: "Phase 13 / build / BuildCodeStrippingAudit"
category: phase-13-build
tags: [unity, phase13]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations, UnityEditor.SceneManagement, UnityEngine.UI
try { return new { success = true, currentLevel = PlayerSettings.GetManagedStrippingLevel(UnityEditor.Build.NamedBuildTarget.Standalone).ToString() }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
