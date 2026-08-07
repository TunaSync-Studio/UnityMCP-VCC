---
name: vrc_world_video_pickup
old_tool: vrc_world_video_pickup
request_type: vrcWorldVideoPickup
description: "Video pickup setup (VRCPickup add)"
category: vrchat-world
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
GameObject Resolve(string n) { if (!string.IsNullOrEmpty(n)) { var g = GameObject.Find(n); if (g != null) return g; } return Selection.activeGameObject; }
// --- end shims ---
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); var go = Resolve(argd?.TryGetValue("targetName", out var tn) == true ? tn?.ToString() : null); if (go == null) { return new { success = false, error = "target required" };  } var pickupType = FindType("VRCPickup"); if (pickupType != null && go.GetComponent(pickupType) == null) Undo.AddComponent(go, pickupType); return new { success = true, target = go.name, note = "Combine with YamaPlayer prefab for video pickup gimmick." }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
