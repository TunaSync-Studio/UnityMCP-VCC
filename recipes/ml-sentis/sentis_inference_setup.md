---
name: sentis_inference_setup
old_tool: sentis_inference_setup
request_type: sentisInferenceSetup
description: "Sentis IWorker detect"
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
try { var workerType = FindType("Unity.Sentis.IWorker"); return new { success = true, sentisWorkerAvailable = workerType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
