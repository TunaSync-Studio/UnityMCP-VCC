---
name: selection_save_load
old_tool: selection_save_load
request_type: selectionSaveLoad
description: "Save/load Selection via SessionState"
category: editor
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.SceneManagement
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string action = argd?.TryGetValue("action", out var a) == true ? a?.ToString() : "save"; if (action == "save") { var names = Selection.gameObjects.Select(g => g.name).ToList(); SessionState.SetString("MCP.SavedSelection", string.Join("|", names)); return new { success = true, action, savedCount = names.Count }; } else { var saved = SessionState.GetString("MCP.SavedSelection", ""); var names = saved.Split('|'); var objs = names.Select(n => GameObject.Find(n)).Where(g => g != null).ToArray(); Selection.objects = objs; return new { success = true, action, restoredCount = objs.Length }; } } catch (Exception e) { return new { success = false, error = e.Message }; }
return null; // extractor: fall-through guard
```
