---
name: vrc_world_audio_setup
old_tool: vrc_world_audio_setup
request_type: vrcWorldAudioSetup
description: "Apply VRChat-standard 3D audio settings (logarithmic rolloff 1m-25m) to all AudioSources."
category: vrchat-audio
tags: [vrchat, audio]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
try
{
    var sources = UnityEngine.Object.FindObjectsByType<AudioSource>(FindObjectsSortMode.None);
    int updated = 0;
    foreach (var s in sources)
    {
        Undo.RecordObject(s, "MCP VRC audio setup");
        s.spatialBlend = 1f; s.minDistance = 1f; s.maxDistance = 25f;
        s.rolloffMode = AudioRolloffMode.Logarithmic;
        updated++;
    }
    return new { success = true, updated, note = "Set 3D + log rolloff 1m-25m for VRChat distance ATM standard" };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
