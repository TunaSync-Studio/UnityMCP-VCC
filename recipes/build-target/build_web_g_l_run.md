---
name: build_web_g_l_run
old_tool: build_web_g_l_run
request_type: buildWebGLRun
description: "BuildPipeline.BuildPlayer for WebGL"
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
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null; if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  } var scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray(); var report = BuildPipeline.BuildPlayer(scenes, outputPath, BuildTarget.WebGL, BuildOptions.None); return new { success = report.summary.result == UnityEditor.Build.Reporting.BuildResult.Succeeded, totalSize = report.summary.totalSize }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
