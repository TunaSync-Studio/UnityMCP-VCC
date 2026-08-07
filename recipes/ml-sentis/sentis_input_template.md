---
name: sentis_input_template
old_tool: sentis_input_template
request_type: sentisInputTemplate
description: "Sentis inference template gen"
category: ml-sentis
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null; if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  } var code = "using UnityEngine;\nusing Unity.Sentis;\npublic class MyInference : MonoBehaviour {\n    public ModelAsset modelAsset;\n    IWorker worker;\n    void Start() {\n        var model = ModelLoader.Load(modelAsset);\n        worker = WorkerFactory.CreateWorker(BackendType.GPUCompute, model);\n    }\n}\n"; Directory.CreateDirectory(Path.GetDirectoryName(outputPath)); File.WriteAllText(outputPath, code); AssetDatabase.Refresh(); return new { success = true, outputPath }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
