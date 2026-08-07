---
name: vrc_avatar_dynamics_pose_test
old_tool: vrc_avatar_dynamics_pose_test
request_type: vrcAvatarDynamicsPoseTest
description: "PhysBone settling test — count PhysBones + Editor Play mode T-pose verification."
category: vrchat-sdk-3-10
tags: [vrchat, physbone, pose, vrcsdk]
params:
  - {name: avatarName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: [vrcsdk]
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from VRCSDK310Handler.cs) ---
Type FindType(string name) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == name); if (t != null) return t; } return null; }
GameObject Resolve(string n) { if (!string.IsNullOrEmpty(n)) { var g = GameObject.Find(n); if (g != null) return g; } return Selection.activeGameObject; }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    var avatar = Resolve(argd != null && argd.TryGetValue("avatarName", out var an) ? an?.ToString() : null);
    if (avatar == null) { return new { success = false, error = "avatar not found" };  }

    var pbType = FindType("VRCPhysBone");
    int pbCount = pbType != null ? avatar.GetComponentsInChildren(pbType, true).Length : 0;
    return new { success = true, avatar = avatar.name, physBoneCount = pbCount, note = "Use Editor Play mode + Animator T-pose to verify PhysBone settling." };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
