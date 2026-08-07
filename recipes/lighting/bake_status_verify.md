---
name: bake_status_verify
old_tool: bake_status_verify
request_type: bakeStatusVerify
description: "Verify Lightmap bake completion: Lightmapping.isRunning + physical Assets/Scenes/<scene>/Lightmap-*.exr file confirm. Returns verdict: running / completed / incomplete-or-cancelled / no-bake-config."
category: lighting
tags: [unity, bake, lightmap, verify]
params:
  - {name: sceneName, type: string, required: false, desc: "Scene name (defaults to active scene)"}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, UnityEditor.SceneManagement
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string sceneName = null;
    if (argd != null && argd.TryGetValue("sceneName", out var sn) && sn != null) sceneName = sn.ToString();

    var scene = EditorSceneManager.GetActiveScene();
    if (string.IsNullOrEmpty(sceneName)) sceneName = scene.name;

    bool isRunning = Lightmapping.isRunning;
    bool bakedGI = Lightmapping.bakedGI;
    bool realtimeGI = Lightmapping.realtimeGI;

    var sceneDir = Path.Combine(Application.dataPath, "Scenes", sceneName);
    var fallbackDir = Path.Combine(Path.GetDirectoryName(scene.path) ?? "", sceneName);
    string foundDir = null;
    List<string> exrFiles = new List<string>();
    foreach (var dir in new[] { sceneDir, fallbackDir, Path.Combine(Application.dataPath, sceneName) })
    {
        if (Directory.Exists(dir))
        {
            var files = Directory.GetFiles(dir, "Lightmap-*.exr", SearchOption.TopDirectoryOnly);
            if (files.Length > 0) { foundDir = dir; exrFiles = files.ToList(); break; }
        }
    }

    string verdict;
    if (isRunning) verdict = "running";
    else if (exrFiles.Count > 0) verdict = "completed";
    else if (bakedGI) verdict = "incomplete-or-cancelled";
    else verdict = "no-bake-config";

    return new
    {
        success = true,
        sceneName,
        isRunning,
        bakedGI,
        realtimeGI,
        foundDir,
        exrCount = exrFiles.Count,
        exrFiles,
        verdict
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
