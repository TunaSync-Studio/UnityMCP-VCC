---
name: timeline_clip_create
old_tool: timeline_clip_create
request_type: timelineClipCreate
description: "Create empty TimelineAsset at outputPath. Requires com.unity.timeline package."
category: animation-timeline
tags: [unity, timeline]
params:
  - {name: outputPath, type: string, required: true, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string outputPath = argd != null && argd.TryGetValue("outputPath", out var op) ? op?.ToString() : null;
    if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  }

    var timelineType = AppDomain.CurrentDomain.GetAssemblies()
        .SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } })
        .FirstOrDefault(tt => tt.FullName == "UnityEngine.Timeline.TimelineAsset");
    if (timelineType == null) { return new { success = false, error = "TimelineAsset type not found (install com.unity.timeline)" };  }

    var asset = ScriptableObject.CreateInstance(timelineType);
    Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
    AssetDatabase.CreateAsset(asset, outputPath);
    AssetDatabase.SaveAssets();

    return new { success = true, outputPath };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
