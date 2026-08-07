---
name: asset_dependency_graph_export
old_tool: asset_dependency_graph_export
request_type: assetDependencyGraphExport
description: "Phase 13 / asset / AssetDependencyGraphExport"
category: phase-13-asset
tags: [unity, phase13]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, System.Text, UnityEditor.Animations, UnityEngine.UI
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string assetPath = argd?.TryGetValue("assetPath", out var ap) == true ? ap?.ToString() : null;
    string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null;
    if (string.IsNullOrEmpty(assetPath) || string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "assetPath + outputPath required" };  }

    var deps = AssetDatabase.GetDependencies(assetPath, true);
    var graph = new Dictionary<string, object>
    {
        ["root"] = assetPath,
        ["totalDependencies"] = deps.Length,
        ["dependencies"] = deps.Select(d => new Dictionary<string, object>
        {
            ["path"] = d,
            ["sizeBytes"] = File.Exists(d) ? new FileInfo(d).Length : 0L
        }).ToList()
    };
    Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
    File.WriteAllText(outputPath, JsonConvert.SerializeObject(graph, Formatting.Indented), Encoding.UTF8);
    return new { success = true, outputPath, totalDependencies = deps.Length };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
