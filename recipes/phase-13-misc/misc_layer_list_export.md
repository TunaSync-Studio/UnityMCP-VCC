---
name: misc_layer_list_export
old_tool: misc_layer_list_export
request_type: miscLayerListExport
description: "Phase 13 / misc / MiscLayerListExport"
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
try { return new { success = true, layers = UnityEditorInternal.InternalEditorUtility.layers }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
