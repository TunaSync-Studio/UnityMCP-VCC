---
name: uitoolkit_u_x_m_l_template
old_tool: uitoolkit_u_x_m_l_template
request_type: uitoolkitUXMLTemplate
description: "UXML template gen"
category: ui-ui-toolkit
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, System.Text
// --- injected local function (send-helper GenScript from Phase11DHandler.cs) ---
object GenScript(string outputPath, string code)
{
if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  } Directory.CreateDirectory(Path.GetDirectoryName(outputPath)); File.WriteAllText(outputPath, code, Encoding.UTF8); AssetDatabase.Refresh(); return new { success = true, outputPath };
}
// --- end local function ---
 var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null; var code = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<ui:UXML xmlns:ui=\"UnityEngine.UIElements\" xmlns:uie=\"UnityEditor.UIElements\">\n    <ui:VisualElement>\n        <ui:Label text=\"Hello UI Toolkit\" />\n        <ui:Button text=\"Click me\" name=\"my-button\" />\n    </ui:VisualElement>\n</ui:UXML>\n"; return GenScript(outputPath, code);
```
