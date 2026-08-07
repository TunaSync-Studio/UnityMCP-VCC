---
name: propertydrawer_gen
old_tool: propertydrawer_gen
request_type: propertyDrawerGen
description: "Generate PropertyAttribute + PropertyDrawer pair template."
category: codegen-editor
tags: [unity, propertydrawer, codegen]
params:
  - {name: outputPath, type: string, required: true, desc: ""}
  - {name: attrName, type: string, required: false, desc: ""}
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
            string attrName = argd?.TryGetValue("attrName", out var an) == true ? an?.ToString() : "MyAttribute";
            string code = $@"using UnityEngine;
using UnityEditor;

public class {attrName} : PropertyAttribute {{ }}

[CustomPropertyDrawer(typeof({attrName}))]
public class {attrName}Drawer : PropertyDrawer
{{
    public override void OnGUI(Rect position, SerializedProperty property, GUIContent label)
    {{
        EditorGUI.PropertyField(position, property, label);
    }}
}}
";
            return GenerateScript(outputPath, code);
```
