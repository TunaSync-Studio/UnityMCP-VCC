---
name: vrc_avatar_thumbnail
old_tool: vrc_avatar_thumbnail
request_type: vrcAvatarThumbnail
description: "Capture Game/Scene camera to PNG for avatar thumbnail. Default 1200x900. Combine with GPT Image 2 (openai-image MCP) for promo edit pipeline."
category: vrchat-vision
tags: [vrchat, thumbnail, screenshot, promo]
params:
  - {name: outputPath, type: string, required: false, desc: "Default <project>/Temp/mcp-avatar-thumb.png"}
  - {name: width, type: number, required: false, desc: ""}
  - {name: height, type: number, required: false, desc: ""}
  - {name: sourceCamera, type: string, required: false, desc: "Camera GameObject name (defaults Camera.main)"}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string outputPath = argd != null && argd.TryGetValue("outputPath", out var op) && op != null ? op.ToString() : Path.Combine(Application.dataPath, "..", "Temp", "mcp-avatar-thumb.png");
    int width = 1200, height = 900;
    if (argd != null && argd.TryGetValue("width", out var w) && w != null) int.TryParse(w.ToString(), out width);
    if (argd != null && argd.TryGetValue("height", out var h) && h != null) int.TryParse(h.ToString(), out height);
    string sourceCamera = argd != null && argd.TryGetValue("sourceCamera", out var sc) && sc != null ? sc.ToString() : null;

    Camera cam = null;
    if (!string.IsNullOrEmpty(sourceCamera))
    {
        var camGo = GameObject.Find(sourceCamera);
        if (camGo != null) cam = camGo.GetComponent<Camera>();
    }
    if (cam == null) cam = Camera.main;
    if (cam == null) cam = UnityEngine.Object.FindFirstObjectByType<Camera>();
    if (cam == null) { return new { success = false, error = "no Camera found in scene" };  }

    var rt = new RenderTexture(width, height, 24);
    cam.targetTexture = rt;
    var tex = new Texture2D(width, height, TextureFormat.RGB24, false);
    cam.Render();
    RenderTexture.active = rt;
    tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
    tex.Apply();
    cam.targetTexture = null;
    RenderTexture.active = null;
    UnityEngine.Object.DestroyImmediate(rt);

    var bytes = tex.EncodeToPNG();
    UnityEngine.Object.DestroyImmediate(tex);

    outputPath = Path.GetFullPath(outputPath);
    Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
    File.WriteAllBytes(outputPath, bytes);

    return new
    {
        success = true,
        outputPath,
        width,
        height,
        bytes = bytes.Length,
        cameraName = cam.name
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
