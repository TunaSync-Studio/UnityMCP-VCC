---
name: input_simulate_press
old_tool: input_simulate_press
request_type: inputSimulatePress
description: "Detect InputSystem. Programmatic input simulation requires Play mode + InputSystem.QueueStateEvent."
category: input-system
tags: [unity, input, simulate]
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
    var inputSystem = FindType("UnityEngine.InputSystem.InputSystem");
    bool installed = inputSystem != null;
    return new { success = true, inputSystemInstalled = installed, note = "Programmatic input simulation requires Editor Play mode + InputTestFixture (or InputSystem.QueueStateEvent)." };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
