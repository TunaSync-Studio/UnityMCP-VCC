---
name: vrcfury_mmd_compat
old_tool: vrcfury_mmd_compat
request_type: vrcfuryMMDCompat
description: "Add VRCFury MMD Compatibility component to preserve MMD blendshapes through optimization. Required for MMD world dance avatars."
category: vrchat-avatar
tags: [vrchat, vrcfury, mmd, vrcsdk]
params:
  - {name: avatarName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: [vrcsdk]
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
    var avatar = ResolveGo(argd != null && argd.TryGetValue("avatarName", out var an) ? an?.ToString() : null);
    if (avatar == null) { return new { success = false, error = "avatar not found" };  }

    var compType = FindType("VRCFuryMMDCompatibility") ?? FindType("MMDCompatibility");
    if (compType == null) { return new { success = false, error = "VRCFury MMDCompatibility type not found" };  }

    var existing = avatar.GetComponent(compType);
    bool added = false;
    if (existing == null) { Undo.AddComponent(avatar, compType); added = true; }

    return new { success = true, avatar = avatar.name, added };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
