---
name: audio_mixer_snapshot
old_tool: audio_mixer_snapshot
request_type: audioMixerSnapshot
description: "AudioMixerSnapshot list"
category: audio
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations
try { var guids = AssetDatabase.FindAssets("t:AudioMixerSnapshot"); return new { success = true, count = guids.Length, paths = guids.Select(g => AssetDatabase.GUIDToAssetPath(g)).ToList() }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
