---
name: build_target_switch
old_tool: build_target_switch
request_type: buildTargetSwitch
description: "Switch active BuildTarget (BuildTarget enum name). Triggers domain reload — combine with editor_wake."
category: build
tags: [unity, build, target]
params:
  - {name: buildTarget, type: string, required: true, desc: ""}
kind: recipe
sync: job
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.PackageManager, UnityEditor.PackageManager.Requests
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string targetStr = argd != null && argd.TryGetValue("buildTarget", out var bt) ? bt?.ToString() : null;
    if (string.IsNullOrEmpty(targetStr)) { return new { success = false, error = "buildTarget required" };  }
    if (!Enum.TryParse<BuildTarget>(targetStr, out var target)) { return new { success = false, error = "invalid: " + targetStr };  }

    BuildTargetGroup grp = BuildPipeline.GetBuildTargetGroup(target);
    EditorUserBuildSettings.SwitchActiveBuildTarget(grp, target);

    return new { success = true, switched = target.ToString(), currentTarget = EditorUserBuildSettings.activeBuildTarget.ToString() };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
