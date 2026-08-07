---
name: vrc_avatar_finger_test
old_tool: vrc_avatar_finger_test
request_type: vrcAvatarFingerTest
description: "Finger bone bind count (expect 30)"
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
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); var avatar = Resolve(argd?.TryGetValue("avatarName", out var an) == true ? an?.ToString() : null); if (avatar == null) { return new { success = false, error = "avatar not found" };  } var anim = avatar.GetComponent<Animator>(); int boundFingers = 0; if (anim != null && anim.isHuman) { for (int i = (int)HumanBodyBones.LeftThumbProximal; i <= (int)HumanBodyBones.RightLittleDistal; i++) if (anim.GetBoneTransform((HumanBodyBones)i) != null) boundFingers++; } return new { success = true, avatar = avatar.name, boundFingerBones = boundFingers, expectedFingerBones = 30 }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
