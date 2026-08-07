---
name: bone_transform_copy
old_tool: bone_transform_copy
request_type: boneTransformCopy
description: "Copy Transform (position/rotation/scale) from source to target. localSpace=true uses local TRS."
category: mesh-bone
tags: [unity, bone, transform]
params:
  - {name: sourceName, type: string, required: true, desc: ""}
  - {name: targetName, type: string, required: true, desc: ""}
  - {name: localSpace, type: boolean, required: false, desc: ""}
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
    bool localSpace = argd?.TryGetValue("localSpace", out var ls) == true && bool.Parse(ls?.ToString() ?? "true");

    if (string.IsNullOrEmpty(sourceName) || string.IsNullOrEmpty(targetName)) { return new { success = false, error = "source + target required" };  }
    var src = GameObject.Find(sourceName)?.transform;
    var tgt = GameObject.Find(targetName)?.transform;
    if (src == null || tgt == null) { return new { success = false, error = "transform not found" };  }

    Undo.RecordObject(tgt, "MCP bone copy");
    if (localSpace)
    {
        tgt.localPosition = src.localPosition;
        tgt.localRotation = src.localRotation;
        tgt.localScale = src.localScale;
    }
    else
    {
        tgt.position = src.position;
        tgt.rotation = src.rotation;
    }
    return new { success = true, source = src.name, target = tgt.name, localSpace };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
