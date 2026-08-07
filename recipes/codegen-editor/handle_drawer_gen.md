---
name: handle_drawer_gen
old_tool: handle_drawer_gen
request_type: handleDrawerGen
description: "Generate CustomEditor with OnSceneGUI Handles.PositionHandle template."
category: codegen-editor
tags: [unity, handles, codegen]
params:
  - {name: outputPath, type: string, required: true, desc: ""}
  - {name: componentName, type: string, required: false, desc: ""}
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
                string componentName = argd?.TryGetValue("componentName", out var cn) == true ? cn?.ToString() : "MyComponent";
                if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  }

                string code = $@"using UnityEngine;
using UnityEditor;

[CustomEditor(typeof({componentName}))]
public class {componentName}HandleDrawer : Editor
{{
    void OnSceneGUI()
    {{
        var t = (Transform)((Component)target).transform;
        EditorGUI.BeginChangeCheck();
        Vector3 newPos = Handles.PositionHandle(t.position, t.rotation);
        if (EditorGUI.EndChangeCheck())
        {{
            Undo.RecordObject(t, ""Move {componentName}"");
            t.position = newPos;
        }}
    }}
}}
";
                Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
                File.WriteAllText(outputPath, code, Encoding.UTF8);
                AssetDatabase.Refresh();
                return new { success = true, outputPath };
            }
            catch (Exception e) { return new { success = false, error = e.Message }; }
```
