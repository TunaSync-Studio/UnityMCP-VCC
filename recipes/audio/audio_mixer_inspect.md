---
name: audio_mixer_inspect
old_tool: audio_mixer_inspect
request_type: audioMixerInspect
description: "List all AudioMixer assets in project."
category: audio
tags: [unity, audiomixer]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
try
{
    var guids = AssetDatabase.FindAssets("t:AudioMixer");
    var list = guids.Select(g => new Dictionary<string, object> { ["path"] = AssetDatabase.GUIDToAssetPath(g) }).ToList();
    return new { success = true, count = list.Count, list };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
