---
name: mppm_test_mode_toggle
old_tool: mppm_test_mode_toggle
request_type: mppmTestModeToggle
description: "Detect MPPM (Multiplayer Play Mode) test mode capability."
category: multiplayer-mppm
tags: [unity, mppm]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.SceneManagement
// --- injected helper shims (from MPPMSceneHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try
{
    var mppmType = FindType("VirtualProjectsEditor");
    return new { success = true, mppmInstalled = mppmType != null, note = "Toggle via Multiplayer Play Mode window." };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
