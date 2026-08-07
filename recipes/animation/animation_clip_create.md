---
name: animation_clip_create
old_tool: animation_clip_create
request_type: animationClipCreate
description: "Create AnimationClip with optional blendshape curves. Useful for FaceEmo / VRCFury custom expression generation."
category: animation
tags: [unity, animation, clip, blendshape]
params:
  - {name: outputPath, type: string, required: true, desc: "Asset path .anim"}
  - {name: frameRate, type: number, required: false, desc: ""}
  - {name: loopTime, type: boolean, required: false, desc: ""}
  - {name: blendShapes, type: array, required: false, desc: "Blendshape curves: [{path, name, value}]"}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, UnityEditor.Animations
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string outputPath = argd != null && argd.TryGetValue("outputPath", out var op) && op != null ? op.ToString() : null;
    if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  }
    bool loopTime = argd != null && argd.TryGetValue("loopTime", out var lt) && lt != null && bool.TryParse(lt.ToString(), out var ltB) && ltB;
    float frameRate = 60f;
    if (argd != null && argd.TryGetValue("frameRate", out var fr) && fr != null) float.TryParse(fr.ToString(), out frameRate);

    var clip = new AnimationClip { frameRate = frameRate };
    var settings = AnimationUtility.GetAnimationClipSettings(clip);
    settings.loopTime = loopTime;
    AnimationUtility.SetAnimationClipSettings(clip, settings);

    if (argd != null && argd.TryGetValue("blendShapes", out var bsObj) && bsObj != null)
    {
        var bsList = bsObj as Newtonsoft.Json.Linq.JArray;
        if (bsList != null)
        {
            foreach (var bs in bsList)
            {
                string path = bs["path"]?.ToString() ?? "";
                string property = "blendShape." + (bs["name"]?.ToString() ?? "");
                float value = bs["value"]?.ToObject<float>() ?? 0;
                var curve = AnimationCurve.Constant(0, 1f / frameRate, value);
                clip.SetCurve(path, typeof(SkinnedMeshRenderer), property, curve);
            }
        }
    }

    Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
    AssetDatabase.CreateAsset(clip, outputPath);
    AssetDatabase.SaveAssets();

    return new
    {
        success = true,
        outputPath,
        frameRate,
        loopTime
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
