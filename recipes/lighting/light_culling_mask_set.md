---
name: light_culling_mask_set
old_tool: light_culling_mask_set
request_type: lightCullingMaskSet
description: "Light cullingMask layer set"
category: lighting
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Build
// --- injected helper shims (from Phase11BHandler.cs) ---
GameObject Resolve(string n) { if (!string.IsNullOrEmpty(n)) { var g = GameObject.Find(n); if (g != null) return g; } return Selection.activeGameObject; }
// --- end shims ---
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); var go = Resolve(argd?.TryGetValue("targetName", out var tn) == true ? tn?.ToString() : null); var light = go?.GetComponent<Light>(); int mask = argd?.TryGetValue("cullingMask", out var cm) == true && int.TryParse(cm?.ToString(), out var cmI) ? cmI : -1; if (light != null) { Undo.RecordObject(light, "MCP culling"); light.cullingMask = mask; } return new { success = true, target = go?.name, cullingMask = light?.cullingMask }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
