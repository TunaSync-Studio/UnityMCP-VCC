---
name: audio_clip_inspect
old_tool: audio_clip_inspect
request_type: audioClipInspect
description: "List AudioClips with samples / channels / frequency / length."
category: audio
tags: [unity, audioclip]
params:
  - {name: folder, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string folder = argd?.TryGetValue("folder", out var f) == true ? f?.ToString() : null;
    var guids = AssetDatabase.FindAssets("t:AudioClip", folder != null ? new[] { folder } : null);
    var list = guids.Take(200).Select(g =>
    {
        var path = AssetDatabase.GUIDToAssetPath(g);
        var clip = AssetDatabase.LoadAssetAtPath<AudioClip>(path);
        return new Dictionary<string, object>
        {
            ["path"] = path,
            ["samples"] = clip?.samples,
            ["channels"] = clip?.channels,
            ["frequency"] = clip?.frequency,
            ["length"] = clip?.length
        };
    }).ToList();
    return new { success = true, count = list.Count, list };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
