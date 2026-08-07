---
name: animator_transition_create
old_tool: animator_transition_create
request_type: animatorTransitionCreate
description: "Create transition between two states in AnimatorController layer."
category: animation-animator
tags: [unity, animator, transition]
params:
  - {name: controllerPath, type: string, required: true, desc: ""}
  - {name: fromState, type: string, required: true, desc: ""}
  - {name: toState, type: string, required: true, desc: ""}
  - {name: layerIndex, type: number, required: false, desc: ""}
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
    string fromState = argd?.TryGetValue("fromState", out var fs) == true ? fs?.ToString() : null;
    string toState = argd?.TryGetValue("toState", out var ts) == true ? ts?.ToString() : null;
    int layerIndex = argd?.TryGetValue("layerIndex", out var li) == true && int.TryParse(li?.ToString(), out var l) ? l : 0;
    if (string.IsNullOrEmpty(ctrlPath) || string.IsNullOrEmpty(fromState) || string.IsNullOrEmpty(toState)) { return new { success = false, error = "controllerPath + fromState + toState required" };  }

    var ac = Load(ctrlPath);
    if (ac == null) { return new { success = false, error = "controller not found" };  }
    var sm = ac.layers[layerIndex].stateMachine;
    var from = sm.states.FirstOrDefault(s => s.state.name == fromState).state;
    var to = sm.states.FirstOrDefault(s => s.state.name == toState).state;
    if (from == null || to == null) { return new { success = false, error = "state not found" };  }

    var trans = from.AddTransition(to);
    EditorUtility.SetDirty(ac);
    AssetDatabase.SaveAssets();
    return new { success = true, fromState, toState };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
