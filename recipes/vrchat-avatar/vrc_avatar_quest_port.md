---
name: vrc_avatar_quest_port
old_tool: vrc_avatar_quest_port
request_type: vrcAvatarQuestPort
description: "Add VRCQuestTools AvatarConverterSettings component for non-destructive PC→Quest conversion. Conversion runs at NDMF build stage. Combine with vrc_avatar_upload after switching BuildTarget=Android."
category: vrchat-avatar
tags: [vrchat, quest, vrcquesttools, android]
params:
  - {name: avatarName, type: string, required: false, desc: ""}
  - {name: addConverter, type: boolean, required: false, desc: "Add AvatarConverterSettings if missing"}
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
    bool addConverter = argd != null && argd.TryGetValue("addConverter", out var ac) && ac != null && bool.TryParse(ac.ToString(), out var acB) && acB;

    var avatar = ResolveAvatar(avatarName);
    if (avatar == null) { return new { success = false, error = "avatar not found" };  }

    Type convSettings = null;
    foreach (var t in AppDomain.CurrentDomain.GetAssemblies().SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } }))
    {
        if (t.Name == "AvatarConverterSettings" && t.Namespace != null && t.Namespace.Contains("KRT.VRCQuestTools")) { convSettings = t; break; }
    }
    if (convSettings == null) { return new { success = false, error = "VRCQuestTools.AvatarConverterSettings not found (install VRCQuestTools)" };  }

    var existing = avatar.GetComponent(convSettings);
    bool added = false;
    if (existing == null && addConverter)
    {
        Undo.AddComponent(avatar, convSettings);
        added = true;
    }

    return new
    {
        success = true,
        avatar = avatar.name,
        converterPresent = existing != null || added,
        addedNew = added,
        note = "Switch BuildTarget to Android then upload via vrc_avatar_upload."
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
