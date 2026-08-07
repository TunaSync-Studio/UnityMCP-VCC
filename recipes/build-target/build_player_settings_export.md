---
name: build_player_settings_export
old_tool: build_player_settings_export
request_type: buildPlayerSettingsExport
description: "PlayerSettings export (productName / version / scriptingBackend)"
category: build-target
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Build
try { return new { success = true, productName = PlayerSettings.productName, companyName = PlayerSettings.companyName, version = PlayerSettings.bundleVersion, scriptingBackend = PlayerSettings.GetScriptingBackend(NamedBuildTarget.Standalone).ToString() }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
