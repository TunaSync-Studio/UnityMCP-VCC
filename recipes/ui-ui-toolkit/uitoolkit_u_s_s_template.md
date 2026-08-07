---
name: uitoolkit_u_s_s_template
old_tool: uitoolkit_u_s_s_template
request_type: uitoolkitUSSTemplate
description: "USS template gen"
category: ui-ui-toolkit
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
 var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null; var code = "Label {\n    color: white;\n    font-size: 16px;\n}\n.button {\n    background-color: rgb(50, 100, 200);\n    border-radius: 4px;\n}\n"; return GenScript(outputPath, code);
```
