---
name: dotween_template_gen
old_tool: dotween_template_gen
request_type: doTweenTemplateGen
description: "Generate DOTween-based MonoBehaviour template (DOMove + DORotate sample)."
category: animation-dotween
tags: [unity, dotween, tween]
params:
  - {name: outputPath, type: string, required: true, desc: ""}
  - {name: className, type: string, required: false, desc: ""}
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
                string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null;
                string className = argd?.TryGetValue("className", out var cn) == true ? cn?.ToString() : "MyTween";
                if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  }

                string code = $@"using UnityEngine;
using DG.Tweening;

public class {className} : MonoBehaviour
{{
    void Start()
    {{
        transform.DOMove(new Vector3(0, 1, 0), 1f).SetEase(Ease.OutQuad);
        transform.DORotate(new Vector3(0, 360, 0), 2f, RotateMode.FastBeyond360).SetLoops(-1);
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
