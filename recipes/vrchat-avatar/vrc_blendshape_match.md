---
name: vrc_blendshape_match
old_tool: vrc_blendshape_match
request_type: vrcBlendshapeMatch
description: "Copy blendshape weights by name from source SkinnedMeshRenderer to target. Reports missing-on-target blendshapes (chimera transplant)."
category: vrchat-avatar
tags: [vrchat, blendshape, chimera]
params:
  - {name: sourceName, type: string, required: true, desc: ""}
  - {name: targetName, type: string, required: true, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.Reflection
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string sourceName = argd != null && argd.TryGetValue("sourceName", out var sn) ? sn?.ToString() : null;
    string targetName = argd != null && argd.TryGetValue("targetName", out var tn) ? tn?.ToString() : null;
    if (string.IsNullOrEmpty(sourceName) || string.IsNullOrEmpty(targetName)) { return new { success = false, error = "sourceName + targetName required" };  }

    var src = GameObject.Find(sourceName)?.GetComponent<SkinnedMeshRenderer>();
    var tgt = GameObject.Find(targetName)?.GetComponent<SkinnedMeshRenderer>();
    if (src == null || tgt == null) { return new { success = false, error = "source or target SkinnedMeshRenderer not found" };  }

    var srcMesh = src.sharedMesh;
    var tgtMesh = tgt.sharedMesh;
    if (srcMesh == null || tgtMesh == null) { return new { success = false, error = "shared mesh missing" };  }

    int matched = 0;
    var report = new List<Dictionary<string, object>>();
    for (int i = 0; i < srcMesh.blendShapeCount; i++)
    {
        var name = srcMesh.GetBlendShapeName(i);
        int tgtIdx = tgtMesh.GetBlendShapeIndex(name);
        if (tgtIdx >= 0)
        {
            var weight = src.GetBlendShapeWeight(i);
            tgt.SetBlendShapeWeight(tgtIdx, weight);
            matched++;
        }
        else
        {
            report.Add(new Dictionary<string, object> { ["name"] = name, ["status"] = "missing-on-target" });
        }
    }

    return new
    {
        success = true,
        source = src.name,
        target = tgt.name,
        sourceCount = srcMesh.blendShapeCount,
        targetCount = tgtMesh.blendShapeCount,
        matchedCount = matched,
        missingOnTarget = report.Take(50).ToList()
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
