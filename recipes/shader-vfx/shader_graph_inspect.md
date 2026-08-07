---
name: shader_graph_inspect
old_tool: shader_graph_inspect
request_type: shaderGraphInspect
description: "List all .shadergraph and .shadersubgraph assets in project (path + size)."
category: shader-vfx
tags: [unity, shadergraph]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
try
{
    var guids = AssetDatabase.FindAssets("t:Shader");
    var sgList = new List<Dictionary<string, object>>();
    foreach (var g in guids.Take(200))
    {
        var path = AssetDatabase.GUIDToAssetPath(g);
        if (!path.EndsWith(".shadergraph") && !path.EndsWith(".shadersubgraph")) continue;
        var size = new FileInfo(path).Length;
        sgList.Add(new Dictionary<string, object> { ["path"] = path, ["isSubGraph"] = path.EndsWith(".shadersubgraph"), ["sizeBytes"] = size });
    }
    return new { success = true, count = sgList.Count, list = sgList };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
