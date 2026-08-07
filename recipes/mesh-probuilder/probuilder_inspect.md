---
name: probuilder_inspect
old_tool: probuilder_inspect
request_type: probuilderInspect
description: "Detect ProBuilder package + count ProBuilderMesh in scene."
category: mesh-probuilder
tags: [unity, probuilder]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from MeshOpsExtHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try
{
    var pmType = FindType("UnityEngine.ProBuilder.ProBuilderMesh");
    int pmCount = pmType != null ? UnityEngine.Object.FindObjectsByType(pmType, FindObjectsSortMode.None).Length : 0;
    return new { success = true, probuilderInstalled = pmType != null, probuilderMeshCount = pmCount };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
