---
name: build_mac_settings
old_tool: build_mac_settings
request_type: buildMacSettings
description: "StandaloneOSX support detect"
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
try { return new { success = true, macOSXSupported = BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.Standalone, BuildTarget.StandaloneOSX) }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
