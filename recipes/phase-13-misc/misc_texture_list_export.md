---
name: misc_texture_list_export
old_tool: misc_texture_list_export
request_type: miscTextureListExport
description: "Phase 13 / misc / MiscTextureListExport"
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
try { var guids = AssetDatabase.FindAssets("t:Texture2D"); return new { success = true, count = guids.Length }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
