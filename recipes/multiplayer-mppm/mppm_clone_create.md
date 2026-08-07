---
name: mppm_clone_create
old_tool: mppm_clone_create
request_type: mppmCloneCreate
description: "Detect Unity 6.x Multiplayer Play Mode package + report status."
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
    var mppmType = FindType("Unity.Multiplayer.Playmode.VirtualProjectsEditor") ?? FindType("VirtualProjectsEditor");
    bool installed = mppmType != null;
    return new { success = true, mppmInstalled = installed, note = "Multiplayer Play Mode requires Unity 6.0+ and com.unity.multiplayer.playmode package." };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
