---
name: audio_mixer_route
old_tool: audio_mixer_route
request_type: audioMixerRoute
description: "AudioSource → Mixer routing count"
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
try { var sources = UnityEngine.Object.FindObjectsByType<AudioSource>(FindObjectsSortMode.None); int routed = sources.Count(s => s.outputAudioMixerGroup != null); return new { success = true, totalSources = sources.Length, routedToMixer = routed }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
