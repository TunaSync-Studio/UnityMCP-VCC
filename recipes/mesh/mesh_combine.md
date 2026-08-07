---
name: mesh_combine
old_tool: mesh_combine
request_type: meshCombine
description: "CombineMeshes on all MeshFilter children of root. Result vertex count returned (asset save manual)."
category: mesh
tags: [unity, mesh, combine]
params:
  - {name: rootName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from MeshOpsExtHandler.cs) ---
GameObject Resolve(string n) { if (!string.IsNullOrEmpty(n)) { var g = GameObject.Find(n); if (g != null) return g; } return Selection.activeGameObject; }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    var root = Resolve(argd?.TryGetValue("rootName", out var rn) == true ? rn?.ToString() : null);
    if (root == null) { return new { success = false, error = "root not found" };  }

    var meshFilters = root.GetComponentsInChildren<MeshFilter>(true).Where(mf => mf.sharedMesh != null).ToList();
    var combine = new CombineInstance[meshFilters.Count];
    for (int i = 0; i < meshFilters.Count; i++)
    {
        combine[i].mesh = meshFilters[i].sharedMesh;
        combine[i].transform = meshFilters[i].transform.localToWorldMatrix;
    }
    var combinedMesh = new Mesh();
    combinedMesh.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
    combinedMesh.CombineMeshes(combine);

    return new
    {
        success = true,
        sourceCount = meshFilters.Count,
        combinedVertexCount = combinedMesh.vertexCount,
        note = "Result mesh in memory only — assign to MeshFilter manually."
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
