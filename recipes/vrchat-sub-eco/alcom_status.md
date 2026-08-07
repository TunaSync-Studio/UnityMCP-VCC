---
name: alcom_status
old_tool: alcom_status
request_type: alcomStatus
description: "ALCOM (VPM client) status"
category: vrchat-sub-eco
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
try { var p = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ALCOM"); return new { success = true, alcomDirExists = Directory.Exists(p), path = p }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
