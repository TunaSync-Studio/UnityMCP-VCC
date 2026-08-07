---
name: vrc_avatar_proximity_audio
old_tool: vrc_avatar_proximity_audio
request_type: vrcAvatarProximityAudio
description: "Proximity audio (3D log 0.5m-5m)"
category: vrchat-audio
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEngine.Tilemaps, UnityEngine.U2D
// --- injected helper shims (from Phase11EHandler.cs) ---
GameObject Resolve(string n) { if (!string.IsNullOrEmpty(n)) { var g = GameObject.Find(n); if (g != null) return g; } return Selection.activeGameObject; }
// --- end shims ---
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); var go = Resolve(argd?.TryGetValue("targetName", out var tn) == true ? tn?.ToString() : null); if (go == null) { return new { success = false, error = "target required" };  } var audio = go.GetComponent<AudioSource>(); if (audio == null) audio = Undo.AddComponent<AudioSource>(go); Undo.RecordObject(audio, "MCP proximity"); audio.spatialBlend = 1f; audio.minDistance = 0.5f; audio.maxDistance = 5f; return new { success = true, target = go.name }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
