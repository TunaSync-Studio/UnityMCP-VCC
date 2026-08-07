---
name: asset_modificationprocessor_gen
old_tool: asset_modificationprocessor_gen
request_type: assetModificationProcessorGen
description: "Generate AssetModificationProcessor template (OnWillDeleteAsset hook)."
category: codegen-asset-pipeline
tags: [unity, asset, modification]
params:
  - {name: outputPath, type: string, required: true, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Text
// --- injected local function (send-helper GenerateScript from CustomEditorAssetProcHandler.cs) ---
object GenerateScript(string outputPath, string content)
{
if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  }
Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
File.WriteAllText(outputPath, content, Encoding.UTF8);
AssetDatabase.Refresh();
return new { success = true, outputPath };
}
// --- end local function ---

            var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
            string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null;
            string code = @"using UnityEngine;
using UnityEditor;

public class MyAssetModificationProcessor : UnityEditor.AssetModificationProcessor
{
    static AssetDeleteResult OnWillDeleteAsset(string assetPath, RemoveAssetOptions options)
    {
        Debug.Log(""[MCP] About to delete: "" + assetPath);
        return AssetDeleteResult.DidNotDelete;
    }
}
";
            return GenerateScript(outputPath, code);
```
