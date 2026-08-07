---
name: vrc_avatar_eye_test
old_tool: vrc_avatar_eye_test
request_type: vrcAvatarEyeTest
description: "Eye bone (LeftEye/RightEye) detection"
category: vrchat-ik
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations
// --- injected helper shims (from Phase11AHandler.cs) ---
GameObject Resolve(string n) { if (!string.IsNullOrEmpty(n)) { var g = GameObject.Find(n); if (g != null) return g; } return Selection.activeGameObject; }
// --- end shims ---
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); var avatar = Resolve(argd?.TryGetValue("avatarName", out var an) == true ? an?.ToString() : null); if (avatar == null) { return new { success = false, error = "avatar not found" };  } var anim = avatar.GetComponent<Animator>(); Transform leftEye = null, rightEye = null; if (anim != null && anim.isHuman) { leftEye = anim.GetBoneTransform(HumanBodyBones.LeftEye); rightEye = anim.GetBoneTransform(HumanBodyBones.RightEye); } return new { success = true, avatar = avatar.name, leftEyeBone = leftEye?.name, rightEyeBone = rightEye?.name }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
