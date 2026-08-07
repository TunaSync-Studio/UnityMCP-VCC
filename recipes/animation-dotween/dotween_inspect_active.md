---
name: dotween_inspect_active
old_tool: dotween_inspect_active
request_type: doTweenInspectActive
description: "Detect DOTween package + DOTween.TotalActiveTweens count."
category: animation-dotween
tags: [unity, dotween]
params: []
kind: recipe
sync: sync
requires: []
qa: review
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from MeshOpsExtHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try
{
    var doTweenType = FindType("DG.Tweening.DOTween");
    bool installed = doTweenType != null;
    int totalActive = 0;
    if (installed)
    {
        var totalProp = doTweenType.GetProperty("TotalActiveTweens", BindingFlags.Public | BindingFlags.Static);
        if (totalProp != null) totalActive = (int)(totalProp.GetValue(null) ?? 0);
    }
    return new { success = true, doTweenInstalled = installed, totalActiveTweens = totalActive };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
