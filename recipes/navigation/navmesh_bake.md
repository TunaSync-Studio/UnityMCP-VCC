---
name: navmesh_bake
old_tool: navmesh_bake
request_type: navMeshBake
description: "Trigger NavMeshBuilder.BuildNavMesh (legacy NavMesh API)."
category: navigation
tags: [unity, navmesh]
params: []
kind: recipe
sync: job
requires: []
qa: review
---
```csharp
// requires-using: System.Reflection, UnityEngine.AI, UnityEngine.UI
try
{
    var navBuilderType = AppDomain.CurrentDomain.GetAssemblies()
        .SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } })
        .FirstOrDefault(tt => tt.FullName == "UnityEditor.AI.NavMeshBuilder");
    if (navBuilderType == null) { return new { success = false, error = "NavMeshBuilder not found" };  }

    var bakeMethod = navBuilderType.GetMethod("BuildNavMesh", BindingFlags.Public | BindingFlags.Static);
    bakeMethod?.Invoke(null, null);
    return new { success = true, triggered = true };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
