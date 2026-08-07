---
name: do_tween_path_template
old_tool: do_tween_path_template
request_type: doTweenPathTemplate
description: "DOTween DOPath template gen"
category: animation-dotween
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Build
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null; if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  } var code = "using UnityEngine;\nusing DG.Tweening;\npublic class MyPath : MonoBehaviour {\n    public Vector3[] waypoints;\n    void Start() {\n        transform.DOPath(waypoints, 5f, PathType.CatmullRom).SetLoops(-1);\n    }\n}\n"; Directory.CreateDirectory(Path.GetDirectoryName(outputPath)); File.WriteAllText(outputPath, code); AssetDatabase.Refresh(); return new { success = true, outputPath }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
