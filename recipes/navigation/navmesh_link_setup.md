---
name: navmesh_link_setup
old_tool: navmesh_link_setup
request_type: navMeshLinkSetup
description: "Add NavMeshLink to target if package available (com.unity.ai.navigation)."
category: navigation
tags: [unity, navmesh, link]
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
    var linkType = AppDomain.CurrentDomain.GetAssemblies()
        .SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } })
        .FirstOrDefault(tt => tt.Name == "NavMeshLink");
    if (linkType != null && go.GetComponent(linkType) == null) Undo.AddComponent(go, linkType);
    return new { success = true, target = go.name, navMeshLinkAvailable = linkType != null };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
