---
name: animator_state_create
old_tool: animator_state_create
request_type: animatorStateCreate
description: "Create AnimatorState in given controller layer with optional clip motion."
category: animation-animator
tags: [unity, animator, state]
params:
  - {name: controllerPath, type: string, required: true, desc: ""}
  - {name: stateName, type: string, required: true, desc: ""}
  - {name: layerIndex, type: number, required: false, desc: ""}
  - {name: clipPath, type: string, required: false, desc: ""}
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
    string stateName = argd?.TryGetValue("stateName", out var s) == true ? s?.ToString() : null;
    int layerIndex = argd?.TryGetValue("layerIndex", out var li) == true && int.TryParse(li?.ToString(), out var l) ? l : 0;
    string clipPath = argd?.TryGetValue("clipPath", out var cp) == true ? cp?.ToString() : null;
    if (string.IsNullOrEmpty(ctrlPath) || string.IsNullOrEmpty(stateName)) { return new { success = false, error = "controllerPath + stateName required" };  }

    var ac = Load(ctrlPath);
    if (ac == null) { return new { success = false, error = "controller not found" };  }
    if (layerIndex >= ac.layers.Length) { return new { success = false, error = "layerIndex out of range" };  }

    var sm = ac.layers[layerIndex].stateMachine;
    var st = sm.AddState(stateName);
    if (!string.IsNullOrEmpty(clipPath)) { var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(clipPath); if (clip != null) st.motion = clip; }
    EditorUtility.SetDirty(ac);
    AssetDatabase.SaveAssets();
    return new { success = true, controllerPath = ctrlPath, layer = ac.layers[layerIndex].name, stateName };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
