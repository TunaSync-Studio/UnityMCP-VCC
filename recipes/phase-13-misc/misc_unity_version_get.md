---
name: misc_unity_version_get
old_tool: misc_unity_version_get
request_type: miscUnityVersionGet
description: "Phase 13 / misc / MiscUnityVersionGet"
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
try { return new { success = true, unityVersion = Application.unityVersion, platform = Application.platform.ToString() }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
