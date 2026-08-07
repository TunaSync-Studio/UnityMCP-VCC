---
name: aac_layer_generate
old_tool: aac_layer_generate
request_type: aacLayerGenerate
description: "Generate Animator As Code (hai-vr/animator-as-code-vrchat) C# template script that creates an Animator layer programmatically. Outputs .cs file with [MenuItem] entry point."
category: vrchat-animation
tags: [vrchat, aac, animator, codegen]
params:
  - {name: outputPath, type: string, required: true, desc: ""}
  - {name: layerName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, System.Text
            try
            {
                var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
                string outputPath = argd != null && argd.TryGetValue("outputPath", out var op) ? op?.ToString() : null;
                string layerName = argd != null && argd.TryGetValue("layerName", out var ln) ? ln?.ToString() : "Custom";
                if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  }

                var template = $@"using AnimatorAsCode.V1;
using AnimatorAsCode.V1.VRC;
using UnityEditor;
using UnityEngine;

public static class {layerName}LayerGenerator
{{
    [MenuItem(""Tools/MCP/Generate {layerName} Layer"")]
    public static void Generate()
    {{
        var avatar = Selection.activeGameObject;
        var aac = AacV1.Create(new AacConfiguration
        {{
            SystemName = ""{layerName}"",
            AnimatorRoot = avatar.transform,
            DefaultValueRoot = avatar.transform,
            AssetKey = ""{layerName}_Generated""
        }});
        var ctrl = aac.NewAnimatorController();
        var fx = ctrl.NewLayer(""{layerName}"");
        var idle = fx.NewState(""Idle"");
        // Add states/transitions here
        Debug.Log(""[AAC] Generated {layerName} layer"");
    }}
}}
";
                Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
                File.WriteAllText(outputPath, template, Encoding.UTF8);
                AssetDatabase.Refresh();

                return new { success = true, outputPath, layerName, note = "Open menu Tools/MCP/Generate to run." };
            }
            catch (Exception e) { return new { success = false, error = e.Message }; }
```
