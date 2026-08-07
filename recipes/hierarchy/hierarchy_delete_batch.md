---
name: hierarchy_delete_batch
old_tool: hierarchy_delete_batch
request_type: hierarchyDeleteBatch
description: "Delete multiple GameObjects by name array."
category: hierarchy
tags: [unity, hierarchy, delete]
params:
  - {name: targetNames, type: array, required: true, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    if (argd == null || !argd.TryGetValue("targetNames", out var tnObj)) { return new { success = false, error = "targetNames array required" };  }
    var names = (tnObj as Newtonsoft.Json.Linq.JArray)?.Select(x => x.ToString()).ToList() ?? new List<string>();

    int deleted = 0;
    foreach (var n in names)
    {
        var g = GameObject.Find(n);
        if (g != null) { Undo.DestroyObjectImmediate(g); deleted++; }
    }
    return new { success = true, requested = names.Count, deleted };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
