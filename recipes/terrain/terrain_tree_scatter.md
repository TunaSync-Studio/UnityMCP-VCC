---
name: terrain_tree_scatter
old_tool: terrain_tree_scatter
request_type: terrainTreeScatter
description: "Report Terrain tree/detail prototype + instance counts."
category: terrain
tags: [unity, terrain, tree]
params:
  - {name: terrainName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string terrainName = argd != null && argd.TryGetValue("terrainName", out var tn) ? tn?.ToString() : null;

    Terrain terrain = null;
    if (!string.IsNullOrEmpty(terrainName)) { var go = GameObject.Find(terrainName); if (go != null) terrain = go.GetComponent<Terrain>(); }
    if (terrain == null) terrain = UnityEngine.Object.FindFirstObjectByType<Terrain>();
    if (terrain == null) { return new { success = false, error = "no Terrain found" };  }

    var data = terrain.terrainData;
    return new
    {
        success = true,
        terrainName = terrain.name,
        treePrototypeCount = data.treePrototypes.Length,
        treeInstanceCount = data.treeInstanceCount,
        detailPrototypeCount = data.detailPrototypes.Length
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
