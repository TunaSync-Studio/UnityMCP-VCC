---
name: vrc_world_persistence_template
old_tool: vrc_world_persistence_template
request_type: vrcWorldPersistenceTemplate
description: "UdonSynced + persistence U# template"
category: vrchat-persistence
tags: [unity, vrcsdk]
params: []
kind: recipe
sync: sync
requires: [vrcsdk]
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
 var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null; var code = "using UdonSharp;\nusing UnityEngine;\nusing VRC.SDKBase;\n[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]\npublic class WorldPersistence : UdonSharpBehaviour {\n    [UdonSynced] public int score;\n    public override void OnPlayerJoined(VRCPlayerApi player) { /* load persistent state */ }\n}\n"; return GenScript(outputPath, code);
```
