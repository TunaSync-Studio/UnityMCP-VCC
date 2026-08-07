---
name: workflow_promo1
old_tool: workflow_promo1
request_type: workflowPromo1
description: "Phase 14 / workflow / WorkflowPromo1"
category: phase-14-workflow
tags: [unity, phase14]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations, UnityEngine.UI
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : Path.Combine(Application.dataPath, "..", "Temp", "mcp-promo.png");
    int width = 1920, height = 1080;
    Camera cam = Camera.main ?? UnityEngine.Object.FindFirstObjectByType<Camera>();
    if (cam == null) { return new { success = false, error = "no Camera" };  }
    outputPath = Path.GetFullPath(outputPath);
    Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
    var rt = new RenderTexture(width, height, 24);
    cam.targetTexture = rt;
    cam.Render();
    RenderTexture.active = rt;
    var tex = new Texture2D(width, height, TextureFormat.RGB24, false);
    tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
    tex.Apply();
    cam.targetTexture = null;
    RenderTexture.active = null;
    UnityEngine.Object.DestroyImmediate(rt);
    File.WriteAllBytes(outputPath, tex.EncodeToPNG());
    UnityEngine.Object.DestroyImmediate(tex);
    return new { success = true, outputPath, width, height };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
