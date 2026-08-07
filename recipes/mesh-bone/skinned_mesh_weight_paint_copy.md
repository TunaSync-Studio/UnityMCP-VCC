---
name: skinned_mesh_weight_paint_copy
old_tool: skinned_mesh_weight_paint_copy
request_type: skinnedMeshWeightPaintCopy
description: "Audit bone-name match between two SkinnedMeshRenderers. Read-only — actual weight transfer needs Blender Data Transfer (production)."
category: mesh-bone
tags: [unity, skin, weight]
params:
  - {name: sourceName, type: string, required: true, desc: ""}
  - {name: targetName, type: string, required: true, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string sourceName = argd?.TryGetValue("sourceName", out var s) == true ? s?.ToString() : null;
    string targetName = argd?.TryGetValue("targetName", out var tg) == true ? tg?.ToString() : null;
    if (string.IsNullOrEmpty(sourceName) || string.IsNullOrEmpty(targetName)) { return new { success = false, error = "source + target required" };  }

    var src = GameObject.Find(sourceName)?.GetComponent<SkinnedMeshRenderer>();
    var tgt = GameObject.Find(targetName)?.GetComponent<SkinnedMeshRenderer>();
    if (src == null || tgt == null) { return new { success = false, error = "SMR not found" };  }

    int srcBoneCount = src.bones?.Length ?? 0;
    int tgtBoneCount = tgt.bones?.Length ?? 0;
    int matched = 0;
    if (src.bones != null && tgt.bones != null)
    {
        var srcNames = src.bones.Select(b => b?.name).ToList();
        var tgtNames = tgt.bones.Select(b => b?.name).ToList();
        matched = srcNames.Intersect(tgtNames).Count();
    }
    return new
    {
        success = true,
        source = src.name,
        target = tgt.name,
        srcBoneCount,
        tgtBoneCount,
        matchedByName = matched,
        note = "Read-only audit. Actual weight transfer requires Mesh.boneWeights manipulation (use Blender Data Transfer for production)."
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
