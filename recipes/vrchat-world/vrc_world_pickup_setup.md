---
name: vrc_world_pickup_setup
old_tool: vrc_world_pickup_setup
request_type: vrcWorldPickupSetup
description: "Batch-add VRCPickup + auto MeshCollider + Rigidbody (kinematic, no gravity) to all Renderer-bearing children of root."
category: vrchat-world
tags: [vrchat, pickup, world]
params:
  - {name: rootName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from VRChatExtHandler.cs) ---
Type FindType(string name) {
            foreach (var a in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type[] types;
                try { types = a.GetTypes(); } catch { continue; }
                var t = types.FirstOrDefault(x => x.Name == name || x.FullName == name);
                if (t != null) return t;
            }
            return null;
        }
GameObject ResolveGo(string name) {
            if (!string.IsNullOrEmpty(name)) { var go = GameObject.Find(name); if (go != null) return go; }
            return Selection.activeGameObject;
        }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string rootName = argd != null && argd.TryGetValue("rootName", out var rn) ? rn?.ToString() : null;

    GameObject root = ResolveGo(rootName);
    if (root == null) { return new { success = false, error = "root not found" };  }

    var pickupType = FindType("VRCPickup");
    if (pickupType == null) { return new { success = false, error = "VRCPickup type not found" };  }

    int affected = 0;
    foreach (var t2 in root.GetComponentsInChildren<Transform>(true))
    {
        if (t2 == root.transform) continue;
        if (t2.GetComponent(pickupType) != null) continue;
        if (t2.GetComponent<MeshRenderer>() == null && t2.GetComponent<SkinnedMeshRenderer>() == null) continue;

        if (t2.GetComponent<Collider>() == null) Undo.AddComponent<MeshCollider>(t2.gameObject);
        if (t2.GetComponent<Rigidbody>() == null)
        {
            var rb = Undo.AddComponent<Rigidbody>(t2.gameObject);
            rb.useGravity = false; rb.isKinematic = true;
        }
        Undo.AddComponent(t2.gameObject, pickupType);
        affected++;
    }

    return new { success = true, root = root.name, affected };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
