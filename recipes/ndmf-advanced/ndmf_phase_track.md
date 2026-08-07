---
name: ndmf_phase_track
old_tool: ndmf_phase_track
request_type: ndmfPhaseTrack
description: "NDMF 4-phase tracking"
category: ndmf-advanced
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.SceneManagement
try { return new { success = true, phases = new[] { "Resolving", "Generating", "Transforming", "Optimizing" } }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
