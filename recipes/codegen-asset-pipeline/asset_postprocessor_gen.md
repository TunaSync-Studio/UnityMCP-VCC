---
name: asset_postprocessor_gen
old_tool: asset_postprocessor_gen
request_type: assetPostprocessorGen
description: "Generate AssetPostprocessor template (OnPreprocessTexture + OnPreprocessModel)."
category: codegen-asset-pipeline
tags: [unity, assetpostprocessor, codegen]
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

public class MyAssetPostprocessor : AssetPostprocessor
{
    void OnPreprocessTexture()
    {
        var importer = (TextureImporter)assetImporter;
        // tweak importer settings here
    }
    void OnPreprocessModel()
    {
        var importer = (ModelImporter)assetImporter;
        // tweak importer settings here
    }
}
";
            return GenerateScript(outputPath, code);
```
