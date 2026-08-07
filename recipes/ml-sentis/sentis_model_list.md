---
name: sentis_model_list
old_tool: sentis_model_list
request_type: sentisModelList
description: "Sentis ModelAsset list"
category: ml-sentis
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from Phase11CHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try { var modelType = FindType("Unity.Sentis.ModelAsset"); var guids = modelType != null ? AssetDatabase.FindAssets($"t:{modelType.Name}") : new string[0]; return new { success = true, sentisInstalled = modelType != null, modelCount = guids.Length }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
