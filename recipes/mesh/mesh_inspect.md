---
name: mesh_inspect
old_tool: mesh_inspect
request_type: meshInspect
description: "Mesh stats (vertex / triangle / submesh / blendshape / bounds) for target's SkinnedMesh or MeshFilter."
category: mesh
tags: [unity, mesh]
params:
  - {name: targetName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string targetName = argd?.TryGetValue("targetName", out var tn) == true ? tn?.ToString() : null;
    GameObject target = !string.IsNullOrEmpty(targetName) ? GameObject.Find(targetName) : Selection.activeGameObject;
    if (target == null) { return new { success = false, error = "target required" };  }

    var smr = target.GetComponent<SkinnedMeshRenderer>();
    var mf = target.GetComponent<MeshFilter>();
    var mesh = smr?.sharedMesh ?? mf?.sharedMesh;
    if (mesh == null) { return new { success = false, error = "no Mesh on target" };  }

    return new
    {
        success = true,
        name = mesh.name,
        vertexCount = mesh.vertexCount,
        triangleCount = mesh.triangles.Length / 3,
        submeshCount = mesh.subMeshCount,
        blendshapeCount = mesh.blendShapeCount,
        bounds = new[] { mesh.bounds.size.x, mesh.bounds.size.y, mesh.bounds.size.z }
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
