---
name: ecs_aspect_template
old_tool: ecs_aspect_template
request_type: ecsAspectTemplate
description: "ECS Aspect template"
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
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null; if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  } var code = "using Unity.Entities;\npublic readonly partial struct MyAspect : IAspect {\n    public readonly RefRW<MyComponent> Component;\n    public float Value { get => Component.ValueRO.Value; set => Component.ValueRW.Value = value; }\n}\n"; Directory.CreateDirectory(Path.GetDirectoryName(outputPath)); File.WriteAllText(outputPath, code); AssetDatabase.Refresh(); return new { success = true, outputPath }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
