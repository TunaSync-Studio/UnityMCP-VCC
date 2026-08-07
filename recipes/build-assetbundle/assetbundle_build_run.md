---
name: assetbundle_build_run
old_tool: assetbundle_build_run
request_type: assetbundleBuildRun
description: "BuildPipeline.BuildAssetBundles to outputPath. buildTarget = enum name."
category: build-assetbundle
tags: [unity, assetbundle, build]
params:
  - {name: outputPath, type: string, required: true, desc: ""}
  - {name: buildTarget, type: string, required: false, desc: ""}
kind: recipe
sync: job
requires: []
qa: clean
---
```csharp
// requires-using: System.IO
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null;
    string targetStr = argd?.TryGetValue("buildTarget", out var bt) == true ? bt?.ToString() : "StandaloneWindows64";
    if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  }
    if (!Enum.TryParse<BuildTarget>(targetStr, out var target)) { return new { success = false, error = "invalid buildTarget" };  }

    Directory.CreateDirectory(outputPath);
    var manifest = BuildPipeline.BuildAssetBundles(outputPath, BuildAssetBundleOptions.None, target);
    return new
    {
        success = manifest != null,
        outputPath,
        bundles = manifest?.GetAllAssetBundles()
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
