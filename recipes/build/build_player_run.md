---
name: build_player_run
old_tool: build_player_run
request_type: buildPlayerRun
description: "Run BuildPipeline.BuildPlayer with enabled scenes from Build Settings."
category: build
tags: [unity, build, pipeline]
params:
  - {name: outputPath, type: string, required: true, desc: ""}
  - {name: buildTarget, type: string, required: false, desc: "BuildTarget enum name"}
kind: recipe
sync: job
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.TestTools.TestRunner.Api
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string outputPath = argd != null && argd.TryGetValue("outputPath", out var op) && op != null ? op.ToString() : null;
    string targetStr = argd != null && argd.TryGetValue("buildTarget", out var bt) && bt != null ? bt.ToString() : "StandaloneWindows64";
    if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  }

    if (!Enum.TryParse<BuildTarget>(targetStr, out var target)) { return new { success = false, error = "invalid buildTarget: " + targetStr };  }

    var scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
    if (scenes.Length == 0) { return new { success = false, error = "no enabled scenes in Build Settings" };  }

    var report = BuildPipeline.BuildPlayer(scenes, outputPath, target, BuildOptions.None);

    return new
    {
        success = report.summary.result == UnityEditor.Build.Reporting.BuildResult.Succeeded,
        outputPath,
        target = target.ToString(),
        sceneCount = scenes.Length,
        totalSize = report.summary.totalSize,
        totalErrors = report.summary.totalErrors,
        totalWarnings = report.summary.totalWarnings,
        duration = report.summary.totalTime.TotalSeconds,
        result = report.summary.result.ToString()
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
