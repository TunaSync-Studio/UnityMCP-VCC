---
name: do_tween_pause_all
old_tool: do_tween_pause_all
request_type: doTweenPauseAll
description: "DOTween.PauseAll reflection invoke"
category: animation-dotween
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: review
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Build
// --- injected helper shims (from Phase11BHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try { var doTweenType = FindType("DG.Tweening.DOTween"); bool installed = doTweenType != null; if (installed) { var pauseAll = doTweenType.GetMethod("PauseAll", BindingFlags.Public | BindingFlags.Static); pauseAll?.Invoke(null, null); } return new { success = true, doTweenInstalled = installed }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
