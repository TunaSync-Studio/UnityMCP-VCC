---
name: audio_listener_setup
old_tool: audio_listener_setup
request_type: audioListenerSetup
description: "AudioListener count + recommended=1"
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
try { var listeners = UnityEngine.Object.FindObjectsByType<AudioListener>(FindObjectsSortMode.None); return new { success = true, listenerCount = listeners.Length, recommended = 1, ok = listeners.Length == 1 }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
