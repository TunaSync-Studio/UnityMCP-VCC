---
name: custom_editor_window_gen
old_tool: custom_editor_window_gen
request_type: customEditorWindowGen
description: "Generate EditorWindow .cs template with [MenuItem] entry under Tools/MCP/."
category: codegen-editor
tags: [unity, editorwindow, codegen]
params:
  - {name: outputPath, type: string, required: true, desc: ""}
  - {name: className, type: string, required: false, desc: ""}
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
            string className = argd?.TryGetValue("className", out var cn) == true ? cn?.ToString() : "MyEditorWindow";
            string code = $@"using UnityEngine;
using UnityEditor;

public class {className} : EditorWindow
{{
    [MenuItem(""Tools/MCP/{className}"")]
    public static void ShowWindow() {{ GetWindow<{className}>(""{className}""); }}
    void OnGUI() {{ EditorGUILayout.LabelField(""Hello from {className}""); }}
}}
";
            return GenerateScript(outputPath, code);
```
