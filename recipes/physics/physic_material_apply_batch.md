---
name: physic_material_apply_batch
old_tool: physic_material_apply_batch
request_type: physicMaterialApplyBatch
description: "PhysicMaterial batch apply to colliders"
category: physics
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEngine.Tilemaps, UnityEngine.U2D
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string materialPath = argd?.TryGetValue("materialPath", out var mp) == true ? mp?.ToString() : null; string rootName = argd?.TryGetValue("rootName", out var rn) == true ? rn?.ToString() : null; if (string.IsNullOrEmpty(materialPath) || string.IsNullOrEmpty(rootName)) { return new { success = false, error = "materialPath + rootName required" };  } var pm = AssetDatabase.LoadAssetAtPath<PhysicMaterial>(materialPath); var root = GameObject.Find(rootName); if (pm == null || root == null) { return new { success = false, error = "material or root not found" };  } int affected = 0; foreach (var col in root.GetComponentsInChildren<Collider>(true)) { Undo.RecordObject(col, "MCP physic mat"); col.material = pm; affected++; } return new { success = true, affected }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
