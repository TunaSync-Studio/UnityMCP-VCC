---
name: misc_tag_list_export
old_tool: misc_tag_list_export
request_type: miscTagListExport
description: "Phase 13 / misc / MiscTagListExport"
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
try { return new { success = true, tags = UnityEditorInternal.InternalEditorUtility.tags }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
