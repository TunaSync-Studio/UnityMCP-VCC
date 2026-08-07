---
name: vrc_avatar_audio_link_setup
old_tool: vrc_avatar_audio_link_setup
request_type: vrcAvatarAudioLinkSetup
description: "VRCAudioLink detect"
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
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try { var alType = FindType("VRCAudioLink.AudioLink"); return new { success = true, audioLinkAvailable = alType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
