---
name: netcode_network_behavior_template
old_tool: netcode_network_behavior_template
request_type: netcodeNetworkBehaviorTemplate
description: "NetworkBehaviour + ServerRpc template"
category: netcode
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, System.Text, UnityEngine.Tilemaps, UnityEngine.U2D
// --- injected local function (send-helper GenScript from Phase11EHandler.cs) ---
object GenScript(string outputPath, string code)
{
if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  } Directory.CreateDirectory(Path.GetDirectoryName(outputPath)); File.WriteAllText(outputPath, code, Encoding.UTF8); AssetDatabase.Refresh(); return new { success = true, outputPath };
}
// --- end local function ---
 var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null; var code = "using Unity.Netcode;\nusing UnityEngine;\npublic class MyNetwork : NetworkBehaviour {\n    NetworkVariable<float> health = new NetworkVariable<float>(100f);\n    [ServerRpc] public void TakeDamageServerRpc(float amount) { health.Value -= amount; }\n}\n"; return GenScript(outputPath, code);
```
