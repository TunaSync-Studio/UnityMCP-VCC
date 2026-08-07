---
name: vfx_graph_inspect
old_tool: vfx_graph_inspect
request_type: vfxGraphInspect
description: "List all VisualEffectAsset (.vfx) in project."
category: shader-vfx
tags: [unity, vfx]
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
    var guids = AssetDatabase.FindAssets("t:VisualEffectAsset");
    var list = guids.Take(200).Select(g =>
    {
        var path = AssetDatabase.GUIDToAssetPath(g);
        return new Dictionary<string, object> { ["path"] = path, ["sizeBytes"] = new FileInfo(path).Length };
    }).ToList();
    return new { success = true, count = list.Count, list };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
