---
name: physics_rigidbody_constraint_set
old_tool: physics_rigidbody_constraint_set
request_type: physicsRigidbodyConstraintSet
description: "Phase 13 / physics / PhysicsRigidbodyConstraintSet"
category: phase-13-physics
tags: [unity, phase13]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations, UnityEngine.UI
// --- injected helper shims (from Phase19RealHandler.cs) ---
GameObject Resolve(string n) { if (!string.IsNullOrEmpty(n)) { var g = GameObject.Find(n); if (g != null) return g; } return Selection.activeGameObject; }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    var go = Resolve(argd?.TryGetValue("targetName", out var tn) == true ? tn?.ToString() : null);
    if (go == null) { return new { success = false, error = "target required" };  }
    var rb = go.GetComponent<Rigidbody>();
    if (rb == null) { return new { success = false, error = "no Rigidbody" };  }
    bool freezeAllRotation = argd?.TryGetValue("freezeAllRotation", out var far) == true && bool.Parse(far?.ToString() ?? "false");
    Undo.RecordObject(rb, "MCP RB constraint");
    if (freezeAllRotation) rb.constraints |= RigidbodyConstraints.FreezeRotation;
    return new { success = true, target = go.name, constraints = rb.constraints.ToString() };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
