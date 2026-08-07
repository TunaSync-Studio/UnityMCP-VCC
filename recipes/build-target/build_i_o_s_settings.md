---
name: build_i_o_s_settings
old_tool: build_i_o_s_settings
request_type: buildIOSSettings
description: "iOS BuildTarget support detect"
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
try { return new { success = true, currentTarget = EditorUserBuildSettings.activeBuildTarget.ToString(), iOSSupported = BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.iOS, BuildTarget.iOS) }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
