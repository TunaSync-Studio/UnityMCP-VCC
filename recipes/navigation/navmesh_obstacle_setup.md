---
name: navmesh_obstacle_setup
old_tool: navmesh_obstacle_setup
request_type: navMeshObstacleSetup
description: "Add NavMeshObstacle component to target."
category: navigation
tags: [unity, navmesh, obstacle]
params:
  - {name: targetName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.Reflection, UnityEngine.AI, UnityEngine.UI
// --- injected helper shims (from UILayoutNavMeshHandler.cs) ---
GameObject Resolve(string n) { if (!string.IsNullOrEmpty(n)) { var g = GameObject.Find(n); if (g != null) return g; } return Selection.activeGameObject; }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    var go = Resolve(argd?.TryGetValue("targetName", out var tn) == true ? tn?.ToString() : null);
    if (go == null) { return new { success = false, error = "target required" };  }
    if (go.GetComponent<NavMeshObstacle>() == null) Undo.AddComponent<NavMeshObstacle>(go);
    return new { success = true, target = go.name };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
