---
name: sentis_inference_run
old_tool: sentis_inference_run
request_type: sentisInferenceRun
description: "Sentis WorkerFactory detect"
category: ai-sentis
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
try { var ws_t = AppDomain.CurrentDomain.GetAssemblies().SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } }).FirstOrDefault(x => x.FullName == "Unity.Sentis.WorkerFactory"); return new { success = true, workerFactoryAvailable = ws_t != null, note = "Use sentis_input_template + ModelLoader.Load + WorkerFactory.CreateWorker." }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
