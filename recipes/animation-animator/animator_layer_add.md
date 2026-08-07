---
name: animator_layer_add
old_tool: animator_layer_add
request_type: animatorLayerAdd
description: "Add layer to AnimatorController with default weight."
category: animation-animator
tags: [unity, animator, layer]
params:
  - {name: controllerPath, type: string, required: true, desc: ""}
  - {name: layerName, type: string, required: false, desc: ""}
  - {name: weight, type: number, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, UnityEditor.Animations
// --- injected helper shims (from AnimatorGraphHandler.cs) ---
AnimatorController Load(string path) => AssetDatabase.LoadAssetAtPath<AnimatorController>(path);
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string ctrlPath = argd?.TryGetValue("controllerPath", out var c) == true ? c?.ToString() : null;
    string layerName = argd?.TryGetValue("layerName", out var ln) == true ? ln?.ToString() : "NewLayer";
    float weight = argd?.TryGetValue("weight", out var w) == true && float.TryParse(w?.ToString(), out var wv) ? wv : 1f;
    if (string.IsNullOrEmpty(ctrlPath)) { return new { success = false, error = "controllerPath required" };  }

    var ac = Load(ctrlPath);
    if (ac == null) { return new { success = false, error = "controller not found" };  }
    ac.AddLayer(layerName);
    var layers = ac.layers;
    layers[layers.Length - 1].defaultWeight = weight;
    ac.layers = layers;
    EditorUtility.SetDirty(ac);
    AssetDatabase.SaveAssets();
    return new { success = true, layerName, weight };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
