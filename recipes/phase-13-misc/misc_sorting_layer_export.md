---
name: misc_sorting_layer_export
old_tool: misc_sorting_layer_export
request_type: miscSortingLayerExport
description: "Phase 13 / misc / MiscSortingLayerExport"
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
try { return new { success = true, sortingLayers = SortingLayer.layers.Select(l => l.name).ToArray() }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
