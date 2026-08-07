---
name: asset_label_set
old_tool: asset_label_set
request_type: assetLabelSet
description: "AssetDatabase.SetLabels"
category: asset-label
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.SceneManagement
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string assetPath = argd?.TryGetValue("assetPath", out var ap) == true ? ap?.ToString() : null; var labelsObj = argd?.TryGetValue("labels", out var lb) == true ? lb : null; if (string.IsNullOrEmpty(assetPath)) { return new { success = false, error = "assetPath required" };  } var asset = AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(assetPath); if (asset == null) { return new { success = false, error = "asset not found" };  } var labels = (labelsObj as Newtonsoft.Json.Linq.JArray)?.Select(x => x.ToString()).ToArray() ?? new string[0]; AssetDatabase.SetLabels(asset, labels); return new { success = true, assetPath, labels }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
