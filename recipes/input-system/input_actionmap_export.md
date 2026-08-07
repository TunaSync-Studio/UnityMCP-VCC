---
name: input_actionmap_export
old_tool: input_actionmap_export
request_type: inputActionmapExport
description: "List all InputActionAsset in project."
category: input-system
tags: [unity, input]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from ProfilerInputHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try
{
    var actionAssetType = FindType("UnityEngine.InputSystem.InputActionAsset");
    if (actionAssetType == null) { return new { success = false, error = "InputSystem not installed" };  }
    var guids = AssetDatabase.FindAssets("t:InputActionAsset");
    var list = guids.Select(g => AssetDatabase.GUIDToAssetPath(g)).ToList();
    return new { success = true, count = list.Count, paths = list };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
