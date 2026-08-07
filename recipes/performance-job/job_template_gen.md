---
name: job_template_gen
old_tool: job_template_gen
request_type: jobTemplateGen
description: "IJob template gen"
category: performance-job
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, System.Text
// --- injected local function (send-helper GenScript from Phase11DHandler.cs) ---
object GenScript(string outputPath, string code)
{
if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  } Directory.CreateDirectory(Path.GetDirectoryName(outputPath)); File.WriteAllText(outputPath, code, Encoding.UTF8); AssetDatabase.Refresh(); return new { success = true, outputPath };
}
// --- end local function ---
 var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null; var code = "using Unity.Jobs;\nusing Unity.Burst;\nusing Unity.Collections;\n[BurstCompile]\npublic struct MyJob : IJob {\n    public NativeArray<float> data;\n    public void Execute() { for (int i=0; i<data.Length; i++) data[i] *= 2f; }\n}\n"; return GenScript(outputPath, code);
```
