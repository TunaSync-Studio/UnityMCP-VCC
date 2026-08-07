---
name: terrain_paint_heightmap
old_tool: terrain_paint_heightmap
request_type: terrainPaintHeightmap
description: "Report all Terrain in scene with heightmap/alphamap resolution + size. action=report only currently."
category: terrain
tags: [unity, terrain, heightmap]
params:
  - {name: action, type: string, required: false, desc: "enum: report"}
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
    string action = argd != null && argd.TryGetValue("action", out var a) ? a?.ToString() : "report";

    var terrains = UnityEngine.Object.FindObjectsByType<Terrain>(FindObjectsSortMode.None);
    var report = terrains.Select(t2 => new Dictionary<string, object>
    {
        ["name"] = t2.name,
        ["heightmapResolution"] = t2.terrainData.heightmapResolution,
        ["size"] = new[] { t2.terrainData.size.x, t2.terrainData.size.y, t2.terrainData.size.z },
        ["alphamapResolution"] = t2.terrainData.alphamapResolution
    }).ToList();

    return new { success = true, terrainCount = terrains.Length, report };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
