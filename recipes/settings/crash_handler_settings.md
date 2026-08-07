---
name: crash_handler_settings
old_tool: crash_handler_settings
request_type: crashHandlerSettings
description: "PlayerSettings.usePlayerLog + runInBackground"
category: settings
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEngine.Tilemaps, UnityEngine.U2D
try { return new { success = true, captureStartupLogs = PlayerSettings.usePlayerLog, runInBackground = PlayerSettings.runInBackground }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
