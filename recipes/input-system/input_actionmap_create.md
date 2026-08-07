---
name: input_actionmap_create
old_tool: input_actionmap_create
request_type: inputActionmapCreate
description: "Create empty InputActionAsset at outputPath. Requires com.unity.inputsystem."
category: input-system
tags: [unity, input, actionmap]
params:
  - {name: outputPath, type: string, required: true, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from ProfilerInputHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null;
    if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  }

    var inputActionsType = FindType("UnityEngine.InputSystem.InputActionAsset");
    if (inputActionsType == null) { return new { success = false, error = "InputSystem package not installed" };  }

    var asset = ScriptableObject.CreateInstance(inputActionsType);
    Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
    AssetDatabase.CreateAsset(asset, outputPath);
    AssetDatabase.SaveAssets();
    return new { success = true, outputPath };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
