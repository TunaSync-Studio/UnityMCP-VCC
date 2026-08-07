---
name: collider_batch_set
old_tool: collider_batch_set
request_type: colliderBatchSet
description: "Add Collider (Box/Sphere/Capsule/Mesh) to all Renderer-bearing children of root that lack one."
category: physics
tags: [unity, collider, physics]
params:
  - {name: rootName, type: string, required: false, desc: ""}
  - {name: colliderType, type: string, required: false, desc: "enum: Box|Sphere|Capsule|Mesh"}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// --- injected helper shims (from PhysicsHandler.cs) ---
GameObject Resolve(string n) { if (!string.IsNullOrEmpty(n)) { var g = GameObject.Find(n); if (g != null) return g; } return Selection.activeGameObject; }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    var root = Resolve(argd?.TryGetValue("rootName", out var rn) == true ? rn?.ToString() : null);
    if (root == null) { return new { success = false, error = "root not found" };  }
    string colliderType = argd?.TryGetValue("colliderType", out var ct) == true ? ct?.ToString() : "Box";

    int affected = 0;
    foreach (var rend in root.GetComponentsInChildren<Renderer>(true))
    {
        if (rend.GetComponent<Collider>() != null) continue;
        Type type = colliderType switch
        {
            "Box" => typeof(BoxCollider),
            "Sphere" => typeof(SphereCollider),
            "Capsule" => typeof(CapsuleCollider),
            "Mesh" => typeof(MeshCollider),
            _ => typeof(BoxCollider)
        };
        Undo.AddComponent(rend.gameObject, type);
        affected++;
    }
    return new { success = true, root = root.name, colliderType, affected };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
