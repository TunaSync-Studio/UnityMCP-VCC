---
name: misc_scene_list_export
old_tool: misc_scene_list_export
request_type: miscSceneListExport
description: "Phase 13 / misc / MiscSceneListExport"
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
try { var guids = AssetDatabase.FindAssets("t:Scene"); return new { success = true, count = guids.Length, paths = guids.Take(50).Select(g => AssetDatabase.GUIDToAssetPath(g)).ToList() }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
