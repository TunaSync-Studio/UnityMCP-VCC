---
name: input_binding_add
old_tool: input_binding_add
request_type: inputBindingAdd
description: "Detect InputSystem package presence. Binding setup via Input Action Editor window."
category: input-system
tags: [unity, input, binding]
params: []
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
    var actionAssetType = FindType("UnityEngine.InputSystem.InputActionAsset");
    bool installed = actionAssetType != null;
    return new { success = true, inputSystemInstalled = installed, note = "Use Input Action Editor window or AAC-style C# scripting for binding setup." };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
