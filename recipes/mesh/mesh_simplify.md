---
name: mesh_simplify
old_tool: mesh_simplify
request_type: meshSimplify
description: "Detect UnityMeshSimplifier package presence (decimation library)."
category: mesh
tags: [unity, mesh, simplify]
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
    var simplifierType = FindType("UnityMeshSimplifier.MeshSimplifier");
    bool installed = simplifierType != null;
    return new { success = true, simplifierInstalled = installed, note = installed ? "Use UnityMeshSimplifier API for actual simplification." : "Install UnityMeshSimplifier package first." };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
