---
name: texture_size_audit
old_tool: texture_size_audit
request_type: textureSizeAudit
description: "List Textures over threshold pixels (default 2048). Estimated bytes uncompressed RGBA."
category: texture-audit
tags: [unity, texture, audit]
params:
  - {name: folder, type: string, required: false, desc: ""}
  - {name: threshold, type: number, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string folder = argd?.TryGetValue("folder", out var f) == true ? f?.ToString() : null;
    int threshold = argd?.TryGetValue("threshold", out var th) == true && int.TryParse(th?.ToString(), out var thi) ? thi : 2048;

    var guids = AssetDatabase.FindAssets("t:Texture2D", folder != null ? new[] { folder } : null);
    var oversized = new List<Dictionary<string, object>>();
    long totalBytes = 0;
    int total = 0;
    foreach (var g in guids)
    {
        var path = AssetDatabase.GUIDToAssetPath(g);
        var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        if (tex == null) continue;
        total++;
        long bytes = (long)tex.width * tex.height * 4;
        totalBytes += bytes;
        if (Mathf.Max(tex.width, tex.height) > threshold) oversized.Add(new Dictionary<string, object> { ["path"] = path, ["width"] = tex.width, ["height"] = tex.height, ["estimatedBytes"] = bytes });
    }
    return new { success = true, total, oversizedCount = oversized.Count, threshold, totalEstimatedBytes = totalBytes, oversized = oversized.Take(50).ToList() };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
