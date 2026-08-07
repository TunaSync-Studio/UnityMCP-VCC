---
name: ecs_baker_template
old_tool: ecs_baker_template
request_type: ecsBakerTemplate
description: "ECS Baker + Component template"
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
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null; if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  } var code = "using Unity.Entities;\nusing UnityEngine;\npublic class MyAuthoring : MonoBehaviour { public float Value; }\npublic class MyBaker : Baker<MyAuthoring> {\n    public override void Bake(MyAuthoring authoring) {\n        var entity = GetEntity(TransformUsageFlags.Dynamic);\n        AddComponent(entity, new MyComponent { Value = authoring.Value });\n    }\n}\npublic struct MyComponent : IComponentData { public float Value; }\n"; Directory.CreateDirectory(Path.GetDirectoryName(outputPath)); File.WriteAllText(outputPath, code); AssetDatabase.Refresh(); return new { success = true, outputPath }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
