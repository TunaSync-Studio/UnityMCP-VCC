---
name: rigidbody_batch_set
old_tool: rigidbody_batch_set
request_type: rigidbodyBatchSet
description: "Batch set Rigidbody isKinematic / useGravity / mass on all RB-bearing children of root."
category: physics
tags: [unity, rigidbody, physics]
params:
  - {name: rootName, type: string, required: false, desc: ""}
  - {name: kinematic, type: boolean, required: false, desc: ""}
  - {name: useGravity, type: boolean, required: false, desc: ""}
  - {name: mass, type: number, required: false, desc: ""}
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
    bool kinematic = argd?.TryGetValue("kinematic", out var k) == true && bool.Parse(k?.ToString() ?? "false");
    bool useGravity = argd?.TryGetValue("useGravity", out var g) == true && bool.Parse(g?.ToString() ?? "true");
    float mass = argd?.TryGetValue("mass", out var ma) == true && float.TryParse(ma?.ToString(), out var mv) ? mv : 1f;

    int affected = 0;
    foreach (var rb in root.GetComponentsInChildren<Rigidbody>(true))
    {
        Undo.RecordObject(rb, "MCP rb batch");
        rb.isKinematic = kinematic;
        rb.useGravity = useGravity;
        rb.mass = mass;
        affected++;
    }
    return new { success = true, root = root.name, affected };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
