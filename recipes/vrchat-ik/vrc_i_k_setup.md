---
name: vrc_i_k_setup
old_tool: vrc_i_k_setup
request_type: vrcIKSetup
description: "Avatar IK setup audit (Animator humanoid check)"
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
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); var avatar = Resolve(argd?.TryGetValue("avatarName", out var an) == true ? an?.ToString() : null); if (avatar == null) { return new { success = false, error = "avatar not found" };  } var anim = avatar.GetComponent<Animator>(); return new { success = true, avatar = avatar.name, animator = anim != null, isHumanoid = anim?.isHuman ?? false }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
