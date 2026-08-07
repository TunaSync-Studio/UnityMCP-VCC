---
name: vrc_avatar_hand_pose_setup
old_tool: vrc_avatar_hand_pose_setup
request_type: vrcAvatarHandPoseSetup
description: "Phase 13 / vrcAvatar / VrcAvatarHandPoseSetup"
category: phase-13-vrcavatar
tags: [unity, phase13]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations, UnityEngine.UI
// --- injected helper shims (from Phase19RealHandler.cs) ---
GameObject Resolve(string n) { if (!string.IsNullOrEmpty(n)) { var g = GameObject.Find(n); if (g != null) return g; } return Selection.activeGameObject; }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    var avatar = Resolve(argd?.TryGetValue("avatarName", out var an) == true ? an?.ToString() : null);
    if (avatar == null) { return new { success = false, error = "avatar required" };  }
    var anim = avatar.GetComponent<Animator>();
    if (anim == null || !anim.isHuman) { return new { success = false, error = "Animator not humanoid" };  }
    var leftHand = anim.GetBoneTransform(HumanBodyBones.LeftHand);
    var rightHand = anim.GetBoneTransform(HumanBodyBones.RightHand);
    return new { success = true, avatar = avatar.name, leftHandBone = leftHand?.name, rightHandBone = rightHand?.name, ready = leftHand != null && rightHand != null };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
