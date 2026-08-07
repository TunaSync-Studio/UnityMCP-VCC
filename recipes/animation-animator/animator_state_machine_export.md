---
name: animator_state_machine_export
old_tool: animator_state_machine_export
request_type: animatorStateMachineExport
description: "Export AnimatorController state machine to Mermaid stateDiagram-v2 markdown for documentation/audit."
category: animation-animator
tags: [unity, animator, mermaid, export]
params:
  - {name: controllerPath, type: string, required: true, desc: ""}
  - {name: layerIndex, type: number, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Text, UnityEditor.Animations
// --- injected helper shims (from AnimatorGraphHandler.cs) ---
AnimatorController Load(string path) => AssetDatabase.LoadAssetAtPath<AnimatorController>(path);
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string ctrlPath = argd?.TryGetValue("controllerPath", out var c) == true ? c?.ToString() : null;
    int layerIndex = argd?.TryGetValue("layerIndex", out var li) == true && int.TryParse(li?.ToString(), out var l) ? l : 0;
    if (string.IsNullOrEmpty(ctrlPath)) { return new { success = false, error = "controllerPath required" };  }
    var ac = Load(ctrlPath);
    if (ac == null) { return new { success = false, error = "controller not found" };  }

    var sm = ac.layers[layerIndex].stateMachine;
    var sb = new StringBuilder();
    sb.AppendLine("stateDiagram-v2");
    foreach (var s in sm.states)
    {
        foreach (var tr in s.state.transitions)
        {
            if (tr.destinationState != null)
                sb.AppendLine($"    {s.state.name.Replace(' ', '_')} --> {tr.destinationState.name.Replace(' ', '_')}");
        }
    }
    return new { success = true, mermaid = sb.ToString(), stateCount = sm.states.Length };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
