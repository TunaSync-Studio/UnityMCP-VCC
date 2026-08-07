---
name: misc_blueprint_id_scan
old_tool: misc_blueprint_id_scan
request_type: miscBlueprintIdScan
description: "Phase 13 / misc / MiscBlueprintIdScan"
category: phase-13-misc
tags: [unity, phase13]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations, UnityEngine.UI
try
{
    var pmType = AppDomain.CurrentDomain.GetAssemblies().SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } }).FirstOrDefault(x => x.Name == "PipelineManager");
    if (pmType == null) { return new { success = false, error = "PipelineManager type not found" };  }
    var managers = UnityEngine.Object.FindObjectsByType(pmType, FindObjectsSortMode.None);
    var results = new List<Dictionary<string, object>>();
    foreach (var m in managers)
    {
        var idField = pmType.GetField("blueprintId");
        var id = idField?.GetValue(m)?.ToString();
        var c = m as Component;
        results.Add(new Dictionary<string, object> { ["gameObject"] = c?.gameObject.name, ["blueprintId"] = id });
    }
    return new { success = true, count = results.Count, results };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
