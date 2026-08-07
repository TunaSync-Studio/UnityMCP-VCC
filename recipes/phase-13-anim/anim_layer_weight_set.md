---
name: anim_layer_weight_set
old_tool: anim_layer_weight_set
request_type: animLayerWeightSet
description: "Phase 13 / anim / AnimLayerWeightSet"
category: phase-13-anim
tags: [unity, phase13]
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
    string controllerPath = argd?.TryGetValue("controllerPath", out var cp) == true ? cp?.ToString() : null;
    int layerIndex = argd?.TryGetValue("layerIndex", out var li) == true && int.TryParse(li?.ToString(), out var lii) ? lii : 0;
    float weight = argd?.TryGetValue("weight", out var w) == true && float.TryParse(w?.ToString(), out var wf) ? wf : 1f;
    if (string.IsNullOrEmpty(controllerPath)) { return new { success = false, error = "controllerPath required" };  }
    var ac = AssetDatabase.LoadAssetAtPath<AnimatorController>(controllerPath);
    if (ac == null || layerIndex >= ac.layers.Length) { return new { success = false, error = "controller or layer not found" };  }
    var layers = ac.layers;
    layers[layerIndex].defaultWeight = weight;
    ac.layers = layers;
    EditorUtility.SetDirty(ac);
    AssetDatabase.SaveAssets();
    return new { success = true, controllerPath, layerIndex, weight };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
