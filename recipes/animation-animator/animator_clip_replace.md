---
name: animator_clip_replace
old_tool: animator_clip_replace
request_type: animatorClipReplace
description: "Replace clip in AnimatorController by name"
category: animation-animator
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.SceneManagement
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string controllerPath = argd?.TryGetValue("controllerPath", out var c) == true ? c?.ToString() : null; string oldClipName = argd?.TryGetValue("oldClipName", out var ocn) == true ? ocn?.ToString() : null; string newClipPath = argd?.TryGetValue("newClipPath", out var ncp) == true ? ncp?.ToString() : null; if (string.IsNullOrEmpty(controllerPath) || string.IsNullOrEmpty(oldClipName) || string.IsNullOrEmpty(newClipPath)) { return new { success = false, error = "controllerPath + oldClipName + newClipPath required" };  } var ac = AssetDatabase.LoadAssetAtPath<UnityEditor.Animations.AnimatorController>(controllerPath); var newClip = AssetDatabase.LoadAssetAtPath<AnimationClip>(newClipPath); if (ac == null || newClip == null) { return new { success = false, error = "controller or clip not found" };  } int replaced = 0; foreach (var layer in ac.layers) { foreach (var s in layer.stateMachine.states) { if (s.state.motion != null && s.state.motion.name == oldClipName) { s.state.motion = newClip; replaced++; } } } EditorUtility.SetDirty(ac); AssetDatabase.SaveAssets(); return new { success = true, replaced }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
