---
name: vrc_world_dropbox_setup
old_tool: vrc_world_dropbox_setup
request_type: vrcWorldDropboxSetup
description: "Add isTrigger collider to target for VRC dropzone. Combine with udonsharp_template_gen objectsync for reset logic."
category: vrchat-world
tags: [vrchat, dropzone]
params:
  - {name: targetName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from VRChatAdvHandler.cs) ---
GameObject Resolve(string n) { if (!string.IsNullOrEmpty(n)) { var g = GameObject.Find(n); if (g != null) return g; } return Selection.activeGameObject; }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    var go = Resolve(argd?.TryGetValue("targetName", out var tn) == true ? tn?.ToString() : null);
    if (go == null) { return new { success = false, error = "target required" };  }

    var col = go.GetComponent<Collider>();
    if (col == null) { col = Undo.AddComponent<BoxCollider>(go); col.isTrigger = true; }
    else { Undo.RecordObject(col, "MCP dropzone"); col.isTrigger = true; }
    return new { success = true, target = go.name, note = "Use udonsharp_template_gen objectsync template + OnPickupUseDown for drop-zone reset logic." };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
