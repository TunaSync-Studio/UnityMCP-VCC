---
name: menuitem_template_gen
old_tool: menuitem_template_gen
request_type: menuItemTemplateGen
description: "Generate static class with [MenuItem] entry at given menuPath."
category: codegen-editor
tags: [unity, menuitem, codegen]
params:
  - {name: outputPath, type: string, required: true, desc: ""}
  - {name: menuPath, type: string, required: false, desc: ""}
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
            string menuPath = argd?.TryGetValue("menuPath", out var mp) == true ? mp?.ToString() : "Tools/MCP/MyAction";
            string code = $@"using UnityEngine;
using UnityEditor;

public static class MyMenuActions
{{
    [MenuItem(""{menuPath}"")]
    public static void Run()
    {{
        Debug.Log(""[MCP] {menuPath} executed"");
    }}
}}
";
            return GenerateScript(outputPath, code);
```
