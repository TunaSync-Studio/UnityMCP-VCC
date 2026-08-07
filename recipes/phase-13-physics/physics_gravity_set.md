---
name: physics_gravity_set
old_tool: physics_gravity_set
request_type: physicsGravitySet
description: "Phase 13 / physics / PhysicsGravitySet"
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
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    var arr = argd?.TryGetValue("gravity", out var gv) == true ? gv as Newtonsoft.Json.Linq.JArray : null;
    if (arr != null && arr.Count == 3)
    {
        Physics.gravity = new Vector3(arr[0].ToObject<float>(), arr[1].ToObject<float>(), arr[2].ToObject<float>());
    }
    return new { success = true, gravity = new[] { Physics.gravity.x, Physics.gravity.y, Physics.gravity.z } };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
