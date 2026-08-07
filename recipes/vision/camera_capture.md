---
name: camera_capture
old_tool: camera_capture
request_type: cameraCapture
description: "Capture Game / Scene view to PNG. Default 1920x1080."
category: vision
tags: [unity, screenshot, camera]
params:
  - {name: outputPath, type: string, required: false, desc: ""}
  - {name: view, type: string, required: false, desc: "enum: game|scene"}
  - {name: width, type: number, required: false, desc: ""}
  - {name: height, type: number, required: false, desc: ""}
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
    string outputPath = argd != null && argd.TryGetValue("outputPath", out var op) && op != null ? op.ToString() : Path.Combine(Application.dataPath, "..", "Temp", "mcp-cam-capture.png");
    string view = argd != null && argd.TryGetValue("view", out var v) && v != null ? v.ToString() : "game";
    int width = 1920, height = 1080;
    if (argd != null && argd.TryGetValue("width", out var w) && w != null) int.TryParse(w.ToString(), out width);
    if (argd != null && argd.TryGetValue("height", out var h) && h != null) int.TryParse(h.ToString(), out height);

    outputPath = Path.GetFullPath(outputPath);
    Directory.CreateDirectory(Path.GetDirectoryName(outputPath));

    Camera cam = null;
    if (view == "scene")
    {
        var sv = SceneView.lastActiveSceneView;
        if (sv != null) cam = sv.camera;
    }
    else
    {
        cam = Camera.main;
        if (cam == null) cam = UnityEngine.Object.FindFirstObjectByType<Camera>();
    }
    if (cam == null) { return new { success = false, error = $"no Camera found for view={view}" };  }

    var rt = new RenderTexture(width, height, 24);
    var prevTarget = cam.targetTexture;
    var prevActive = RenderTexture.active;
    cam.targetTexture = rt;
    cam.Render();
    RenderTexture.active = rt;

    var tex = new Texture2D(width, height, TextureFormat.RGB24, false);
    tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
    tex.Apply();

    cam.targetTexture = prevTarget;
    RenderTexture.active = prevActive;
    UnityEngine.Object.DestroyImmediate(rt);

    var bytes = tex.EncodeToPNG();
    UnityEngine.Object.DestroyImmediate(tex);
    File.WriteAllBytes(outputPath, bytes);

    return new
    {
        success = true,
        outputPath,
        view,
        cameraName = cam.name,
        width,
        height,
        bytes = bytes.Length
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
