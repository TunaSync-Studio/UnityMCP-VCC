---
name: animator_parameter_add
old_tool: animator_parameter_add
request_type: animatorParameterAdd
description: "Add Animator parameter (Bool / Float / Int / Trigger)."
category: animation-animator
tags: [unity, animator, parameter]
params:
  - {name: controllerPath, type: string, required: true, desc: ""}
  - {name: paramName, type: string, required: true, desc: ""}
  - {name: paramType, type: string, required: false, desc: "enum: Bool|Float|Int|Trigger"}
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
    string paramName = argd?.TryGetValue("paramName", out var pn) == true ? pn?.ToString() : null;
    string paramType = argd?.TryGetValue("paramType", out var pt) == true ? pt?.ToString() : "Float";
    if (string.IsNullOrEmpty(ctrlPath) || string.IsNullOrEmpty(paramName)) { return new { success = false, error = "controllerPath + paramName required" };  }

    var ac = Load(ctrlPath);
    if (ac == null) { return new { success = false, error = "controller not found" };  }
    if (Enum.TryParse<AnimatorControllerParameterType>(paramType, out var pType)) ac.AddParameter(paramName, pType);
    else { return new { success = false, error = "invalid paramType" };  }
    EditorUtility.SetDirty(ac);
    AssetDatabase.SaveAssets();
    return new { success = true, paramName, paramType };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
