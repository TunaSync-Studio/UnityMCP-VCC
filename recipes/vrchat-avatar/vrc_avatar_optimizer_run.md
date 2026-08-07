---
name: vrc_avatar_optimizer_run
old_tool: vrc_avatar_optimizer_run
request_type: vrcAvatarOptimizerRun
description: "Add Anatawa12.AvatarOptimizer.TraceAndOptimize component for automatic mesh/material/animation optimization. Runs at NDMF build stage."
category: vrchat-avatar
tags: [vrchat, aao, optimizer, anatawa12]
params:
  - {name: avatarName, type: string, required: false, desc: ""}
  - {name: addTraceAndOptimize, type: boolean, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from VRCAvatarHandler.cs) ---
GameObject ResolveAvatar(string name) {
            if (!string.IsNullOrEmpty(name))
            {
                var go = GameObject.Find(name);
                if (go != null) return go;
            }
            return Selection.activeGameObject;
        }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string avatarName = argd != null && argd.TryGetValue("avatarName", out var an) && an != null ? an.ToString() : null;
    bool addTraceComponent = argd != null && argd.TryGetValue("addTraceAndOptimize", out var ata) && ata != null && bool.TryParse(ata.ToString(), out var ataB) && ataB;

    var avatar = ResolveAvatar(avatarName);
    if (avatar == null) { return new { success = false, error = "avatar not found" };  }

    Type traceType = null;
    foreach (var t in AppDomain.CurrentDomain.GetAssemblies().SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } }))
    {
        if (t.Name == "TraceAndOptimize" && t.Namespace != null && t.Namespace.StartsWith("Anatawa12.AvatarOptimizer")) { traceType = t; break; }
    }
    if (traceType == null) { return new { success = false, error = "AAO TraceAndOptimize type not found" };  }

    var existing = avatar.GetComponent(traceType);
    bool added = false;
    if (existing == null && addTraceComponent)
    {
        Undo.AddComponent(avatar, traceType);
        added = true;
    }

    return new
    {
        success = true,
        avatar = avatar.name,
        traceComponentPresent = existing != null || added,
        addedNew = added,
        note = "AAO runs at NDMF build stage automatically."
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
