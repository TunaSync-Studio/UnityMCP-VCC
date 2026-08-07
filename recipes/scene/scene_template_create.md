---
name: scene_template_create
old_tool: scene_template_create
request_type: sceneTemplateCreate
description: "Create empty SceneTemplateAsset at outputPath."
category: scene
tags: [unity, scenetemplate]
params:
  - {name: outputPath, type: string, required: true, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.SceneManagement
// --- injected helper shims (from MPPMSceneHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null;
    if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  }

    var sceneTemplateType = FindType("UnityEditor.SceneTemplate.SceneTemplateAsset");
    if (sceneTemplateType == null) { return new { success = false, error = "SceneTemplate API not found" };  }

    var asset = ScriptableObject.CreateInstance(sceneTemplateType);
    Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
    AssetDatabase.CreateAsset(asset, outputPath);
    AssetDatabase.SaveAssets();
    return new { success = true, outputPath };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
