---
name: anim_clip_loop_set
old_tool: anim_clip_loop_set
request_type: animClipLoopSet
description: "Phase 13 / anim / AnimClipLoopSet"
category: phase-13-anim
tags: [unity, phase13]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations, UnityEditor.SceneManagement, UnityEngine.UI
// --- injected helper shims (from Phase20RealHandler.cs) ---
Dictionary<string, object> Args() { try { return args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); } catch { return new Dictionary<string, object>(); } }
bool GetB(Dictionary<string, object> a, string k, bool def = false) { var s = GetS(a, k); if (s != null && bool.TryParse(s, out var b)) return b; return def; }
string GetS(Dictionary<string, object> a, string k) { if (a != null && a.TryGetValue(k, out var v) && v != null) return v.ToString(); return null; }
AnimationClip LoadClip(string p) => AssetDatabase.LoadAssetAtPath<AnimationClip>(p);
// --- end shims ---
try { var a = Args(); var c = LoadClip(GetS(a, "clipPath")); var loop = GetB(a, "loop"); if (c == null) { return new { success = false, error = "clip not found" };  } var s = AnimationUtility.GetAnimationClipSettings(c); s.loopTime = loop; AnimationUtility.SetAnimationClipSettings(c, s); EditorUtility.SetDirty(c); AssetDatabase.SaveAssets(); return new { success = true, loop }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
