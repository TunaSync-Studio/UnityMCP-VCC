---
name: material_render_queue_set
old_tool: material_render_queue_set
request_type: materialRenderQueueSet
description: "Material.renderQueue set"
category: material
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.SceneManagement
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string materialPath = argd?.TryGetValue("materialPath", out var mp) == true ? mp?.ToString() : null; int queue = argd?.TryGetValue("renderQueue", out var rq) == true && int.TryParse(rq?.ToString(), out var rqI) ? rqI : 2000; if (string.IsNullOrEmpty(materialPath)) { return new { success = false, error = "materialPath required" };  } var mat = AssetDatabase.LoadAssetAtPath<Material>(materialPath); if (mat == null) { return new { success = false, error = "material not found" };  } mat.renderQueue = queue; EditorUtility.SetDirty(mat); AssetDatabase.SaveAssets(); return new { success = true, materialPath, renderQueue = queue }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
