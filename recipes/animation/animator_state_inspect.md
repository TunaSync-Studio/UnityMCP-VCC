---
name: animator_state_inspect
old_tool: animator_state_inspect
request_type: animatorStateInspect
description: "Traverse AnimatorController state machine: layers, states, transitions, parameters. Used for audit/debug of complex avatar FX layers."
category: animation
tags: [unity, animator, fsm, inspect]
params:
  - {name: controllerPath, type: string, required: true, desc: "AnimatorController asset path"}
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
    string controllerPath = argd != null && argd.TryGetValue("controllerPath", out var cp) && cp != null ? cp.ToString() : null;
    if (string.IsNullOrEmpty(controllerPath)) { return new { success = false, error = "controllerPath required" };  }

    var ac = AssetDatabase.LoadAssetAtPath<AnimatorController>(controllerPath);
    if (ac == null) { return new { success = false, error = "AnimatorController not found at " + controllerPath };  }

    var layers = ac.layers.Select(l => new Dictionary<string, object>
    {
        ["name"] = l.name,
        ["weight"] = l.defaultWeight,
        ["stateCount"] = l.stateMachine?.states?.Length ?? 0,
        ["transitionCount"] = l.stateMachine?.anyStateTransitions?.Length ?? 0,
        ["states"] = l.stateMachine?.states?.Select(s => new
        {
            name = s.state.name,
            motion = s.state.motion?.name,
            speed = s.state.speed,
            transitionCount = s.state.transitions.Length
        }).ToList()
    }).ToList();

    var parameters = ac.parameters.Select(p => new
    {
        name = p.name,
        type = p.type.ToString(),
        defaultBool = p.type == AnimatorControllerParameterType.Bool ? (object)p.defaultBool : null,
        defaultFloat = p.type == AnimatorControllerParameterType.Float ? (object)p.defaultFloat : null,
        defaultInt = p.type == AnimatorControllerParameterType.Int ? (object)p.defaultInt : null
    }).ToList();

    return new
    {
        success = true,
        controllerPath,
        layerCount = ac.layers.Length,
        parameterCount = ac.parameters.Length,
        layers,
        parameters
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
