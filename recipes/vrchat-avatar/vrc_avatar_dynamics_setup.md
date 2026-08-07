---
name: vrc_avatar_dynamics_setup
old_tool: vrc_avatar_dynamics_setup
request_type: vrcAvatarDynamicsSetup
description: "VRC SDK 3.10 Avatar Dynamics audit/convert: report PhysBone/Contact/Constraint counts, optionally convert Unity IConstraint → VRCConstraint via AvatarDynamicsSetup.ConvertUnityConstraint reflection."
category: vrchat-avatar
tags: [vrchat, physbone, constraint, dynamics, vrcsdk]
params:
  - {name: avatarName, type: string, required: false, desc: ""}
  - {name: mode, type: string, required: false, desc: "enum: report|convert"}
kind: recipe
sync: sync
requires: [vrcsdk]
qa: review
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

    string mode = argd != null && argd.TryGetValue("mode", out var m) ? m?.ToString() : "report";
    var pbType = FindType("VRCPhysBone");
    var ccType = FindType("VRCContactSender") ?? FindType("VRCContactReceiver");
    var constraintType = FindType("VRCParentConstraint");

    int pbCount = pbType != null ? avatar.GetComponentsInChildren(pbType, true).Length : 0;
    int ccCount = ccType != null ? avatar.GetComponentsInChildren(ccType, true).Length : 0;
    int constraintCount = constraintType != null ? avatar.GetComponentsInChildren(constraintType, true).Length : 0;

    int converted = 0;
    if (mode == "convert")
    {
        var setupType = FindType("AvatarDynamicsSetup");
        var convertMethod = setupType?.GetMethod("ConvertUnityConstraint", BindingFlags.Public | BindingFlags.Static);
        if (convertMethod != null)
        {
            foreach (var unityCon in avatar.GetComponentsInChildren<UnityEngine.Animations.IConstraint>(true))
            {
                try { convertMethod.Invoke(null, new object[] { unityCon }); converted++; } catch { }
            }
        }
    }

    return new
    {
        success = true,
        avatar = avatar.name,
        physBoneCount = pbCount,
        contactCount = ccCount,
        parentConstraintCount = constraintCount,
        convertedToVRC = converted,
        mode
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
