---
name: editor_pref_export
old_tool: editor_pref_export
request_type: editorPrefExport
description: "EditorPrefs subset export to JSON"
category: editor-settings
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.SceneManagement
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null; if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  } var prefs = new Dictionary<string, object>(); var keys = new[] { "PrefabStage_Mode", "Scene-vp_size", "GUI Skin" }; foreach (var k in keys) { if (EditorPrefs.HasKey(k)) prefs[k] = EditorPrefs.GetString(k, ""); } File.WriteAllText(outputPath, JsonConvert.SerializeObject(prefs, Formatting.Indented)); return new { success = true, outputPath, exportedKeys = prefs.Count }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
