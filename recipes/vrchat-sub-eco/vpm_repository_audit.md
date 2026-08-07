---
name: vpm_repository_audit
old_tool: vpm_repository_audit
request_type: vpmRepositoryAudit
description: "VCC settings.json audit"
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
try { var p = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "VRChatCreatorCompanion", "Settings"); var settings = Path.Combine(p, "settings.json"); return new { success = true, vccSettingsExists = File.Exists(settings), path = settings }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
