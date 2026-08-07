---
name: gameobject_hierarchy_search
old_tool: gameobject_hierarchy_search
request_type: gameObjectHierarchySearch
description: "Search all scene GameObjects by nameContains + tag + componentName. Returns name/tag/layer/active list."
category: hierarchy
tags: [unity, search, hierarchy]
params:
  - {name: nameContains, type: string, required: false, desc: ""}
  - {name: tag, type: string, required: false, desc: ""}
  - {name: componentName, type: string, required: false, desc: ""}
  - {name: limit, type: number, required: false, desc: ""}
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
    string nameFilter = argd != null && argd.TryGetValue("nameContains", out var nc) ? nc?.ToString() : null;
    string tagFilter = argd != null && argd.TryGetValue("tag", out var tg) ? tg?.ToString() : null;
    string componentFilter = argd != null && argd.TryGetValue("componentName", out var cn) ? cn?.ToString() : null;
    int limit = argd != null && argd.TryGetValue("limit", out var lm) && int.TryParse(lm?.ToString(), out var li) ? li : 200;

    var results = new List<Dictionary<string, object>>();
    foreach (var go in UnityEngine.Object.FindObjectsByType<GameObject>(FindObjectsSortMode.None))
    {
        if (results.Count >= limit) break;
        if (nameFilter != null && !go.name.Contains(nameFilter)) continue;
        if (tagFilter != null && go.tag != tagFilter) continue;
        if (componentFilter != null && go.GetComponentsInChildren<Component>(true).All(c => c == null || c.GetType().Name != componentFilter)) continue;

        results.Add(new Dictionary<string, object>
        {
            ["name"] = go.name,
            ["tag"] = go.tag,
            ["layer"] = LayerMask.LayerToName(go.layer),
            ["activeInHierarchy"] = go.activeInHierarchy
        });
    }

    return new { success = true, count = results.Count, results };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
