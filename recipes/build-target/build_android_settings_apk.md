---
name: build_android_settings_apk
old_tool: build_android_settings_apk
request_type: buildAndroidSettingsApk
description: "Android BuildTarget + bundleIdentifier"
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
try { return new { success = true, androidSupported = BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.Android, BuildTarget.Android), bundleIdentifier = PlayerSettings.applicationIdentifier }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
