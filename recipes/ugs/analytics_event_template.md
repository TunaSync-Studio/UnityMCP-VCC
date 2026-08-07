---
name: analytics_event_template
old_tool: analytics_event_template
request_type: analyticsEventTemplate
description: "AnalyticsService event template"
category: ugs
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
 var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null; var code = "using Unity.Services.Analytics;\nusing UnityEngine;\npublic class MyAnalytics : MonoBehaviour {\n    void Start() {\n        AnalyticsService.Instance.RecordEvent(\"my_event\");\n    }\n}\n"; return GenScript(outputPath, code);
```
