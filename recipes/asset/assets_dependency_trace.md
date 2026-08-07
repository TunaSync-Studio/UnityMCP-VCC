---
name: assets_dependency_trace
old_tool: assets_dependency_trace
request_type: assetsDependencyTrace
description: "AssetDatabase.GetDependencies(assetPath, recursive=bool). Returns dependency list (top 500)."
category: asset
tags: [unity, asset, dependency]
params:
  - {name: assetPath, type: string, required: true, desc: ""}
  - {name: recursive, type: boolean, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.PackageManager, UnityEditor.PackageManager.Requests
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string assetPath = argd != null && argd.TryGetValue("assetPath", out var ap) ? ap?.ToString() : null;
    bool recursive = argd != null && argd.TryGetValue("recursive", out var r) && bool.TryParse(r?.ToString(), out var rB) && rB;
    if (string.IsNullOrEmpty(assetPath)) { return new { success = false, error = "assetPath required" };  }

    var deps = AssetDatabase.GetDependencies(assetPath, recursive);
    return new { success = true, assetPath, recursive, count = deps.Length, dependencies = deps.Take(500).ToArray() };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
