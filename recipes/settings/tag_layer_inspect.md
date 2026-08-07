---
name: tag_layer_inspect
old_tool: tag_layer_inspect
request_type: tagLayerInspect
description: "Tags + Layers list"
category: settings
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEngine.Tilemaps, UnityEngine.U2D
try { var tags = UnityEditorInternal.InternalEditorUtility.tags; var layers = UnityEditorInternal.InternalEditorUtility.layers; return new { success = true, tags, layers, tagCount = tags.Length, layerCount = layers.Length }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
