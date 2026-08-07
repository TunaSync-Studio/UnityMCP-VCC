---
name: audio_source_batch_set
old_tool: audio_source_batch_set
request_type: audioSourceBatchSet
description: "Batch set AudioSource.spatialBlend across all scene sources. action=set with spatialBlend=0..1."
category: audio
tags: [unity, audiosource, spatial]
params:
  - {name: action, type: string, required: false, desc: "enum: report|set"}
  - {name: spatialBlend, type: number, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string action = argd?.TryGetValue("action", out var a) == true ? a?.ToString() : "report";
    var sources = UnityEngine.Object.FindObjectsByType<AudioSource>(FindObjectsSortMode.None);
    int affected = 0;
    if (action == "set" && argd.TryGetValue("spatialBlend", out var sb) && float.TryParse(sb?.ToString(), out var sbF))
    {
        foreach (var s in sources) { Undo.RecordObject(s, "MCP audio batch"); s.spatialBlend = sbF; affected++; }
    }
    return new { success = true, totalCount = sources.Length, affected };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
