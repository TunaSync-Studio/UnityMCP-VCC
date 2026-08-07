---
name: joint_setup
old_tool: joint_setup
request_type: jointSetup
description: "Add Joint (Hinge / Spring / Configurable / Fixed) + Rigidbody to target."
category: physics
tags: [unity, joint, physics]
params:
  - {name: targetName, type: string, required: false, desc: ""}
  - {name: jointType, type: string, required: false, desc: "enum: Hinge|Spring|Configurable|Fixed"}
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
    var go = Resolve(argd?.TryGetValue("targetName", out var tn) == true ? tn?.ToString() : null);
    if (go == null) { return new { success = false, error = "target not found" };  }
    string jointType = argd?.TryGetValue("jointType", out var jt) == true ? jt?.ToString() : "Hinge";

    Type type = jointType switch
    {
        "Hinge" => typeof(HingeJoint),
        "Spring" => typeof(SpringJoint),
        "Configurable" => typeof(ConfigurableJoint),
        "Fixed" => typeof(FixedJoint),
        _ => null
    };
    if (type == null) { return new { success = false, error = "invalid jointType" };  }

    if (go.GetComponent<Rigidbody>() == null) Undo.AddComponent<Rigidbody>(go);
    Undo.AddComponent(go, type);
    return new { success = true, target = go.name, jointType };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
