---
name: ecs_system_template
old_tool: ecs_system_template
request_type: ecsSystemTemplate
description: "ECS ISystem + Burst template"
category: ecs-dots
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null; if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  } var code = "using Unity.Entities;\nusing Unity.Burst;\npublic partial struct MySystem : ISystem {\n    [BurstCompile]\n    public void OnUpdate(ref SystemState state) {\n        // job logic\n    }\n}\n"; Directory.CreateDirectory(Path.GetDirectoryName(outputPath)); File.WriteAllText(outputPath, code); AssetDatabase.Refresh(); return new { success = true, outputPath }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
