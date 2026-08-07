---
name: shader_render_queue_audit_all
old_tool: shader_render_queue_audit_all
request_type: shaderRenderQueueAuditAll
description: "Phase 13 / shader / ShaderRenderQueueAuditAll"
category: phase-13-shader
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
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string folder = argd?.TryGetValue("folder", out var f) == true ? f?.ToString() : null;
    var guids = AssetDatabase.FindAssets("t:Material", folder != null ? new[] { folder } : null);
    var summary = new Dictionary<int, int>();
    int total = 0;
    foreach (var g in guids)
    {
        var mat = AssetDatabase.LoadAssetAtPath<Material>(AssetDatabase.GUIDToAssetPath(g));
        if (mat == null) continue;
        total++;
        var q = mat.renderQueue;
        summary[q] = summary.TryGetValue(q, out var c) ? c + 1 : 1;
    }
    return new { success = true, total, queueDistribution = summary };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
