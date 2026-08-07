---
name: script_template_generate
old_tool: script_template_generate
request_type: scriptTemplateGenerate
description: "Generate C# template for MonoBehaviour / ScriptableObject / CustomEditor."
category: codegen
tags: [unity, script, template]
params:
  - {name: outputPath, type: string, required: true, desc: ""}
  - {name: templateType, type: string, required: false, desc: "enum: monobehaviour|scriptableobject|editor"}
  - {name: className, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Text
            try
            {
                var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
                string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null;
                string templateType = argd?.TryGetValue("templateType", out var tt) == true ? tt?.ToString() : "monobehaviour";
                string className = argd?.TryGetValue("className", out var cn) == true ? cn?.ToString() : "MyScript";
                if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  }

                string code;
                if (templateType == "scriptableobject")
                {
                    code = $@"using UnityEngine;
[CreateAssetMenu(fileName=""{className}"", menuName=""MCP/{className}"")]
public class {className} : ScriptableObject
{{
    public int value;
}}
";
                }
                else if (templateType == "editor")
                {
                    code = $@"using UnityEngine;
using UnityEditor;
[CustomEditor(typeof({className}))]
public class {className}Editor : Editor
{{
    public override void OnInspectorGUI() {{ DrawDefaultInspector(); }}
}}
";
                }
                else
                {
                    code = $@"using UnityEngine;
public class {className} : MonoBehaviour
{{
    void Start() {{ }}
    void Update() {{ }}
}}
";
                }
                Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
                File.WriteAllText(outputPath, code, Encoding.UTF8);
                AssetDatabase.Refresh();
                return new { success = true, outputPath, templateType, className };
            }
            catch (Exception e) { return new { success = false, error = e.Message }; }
```
