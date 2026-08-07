---
name: vrcfury_component_add
old_tool: vrcfury_component_add
request_type: vrcfuryComponentAdd
description: "Add VRCFury component (FullController / Toggle / etc) to avatar. componentType = type name e.g. VRCFury, FullController, Toggle."
category: vrchat-avatar
tags: [vrchat, vrcfury, vrcsdk]
params:
  - {name: avatarName, type: string, required: false, desc: ""}
  - {name: componentType, type: string, required: false, desc: ""}
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
    string componentTypeName = argd != null && argd.TryGetValue("componentType", out var ct) ? ct?.ToString() : "VRCFury";

    var compType = FindType(componentTypeName);
    if (compType == null) { return new { success = false, error = $"VRCFury type {componentTypeName} not found (install VRCFury)" };  }

    var existing = avatar.GetComponent(compType);
    bool added = false;
    if (existing == null) { Undo.AddComponent(avatar, compType); added = true; }

    return new { success = true, avatar = avatar.name, componentType = componentTypeName, added };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
