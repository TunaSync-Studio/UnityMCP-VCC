---
name: ndmf_build_context_inspect
old_tool: ndmf_build_context_inspect
request_type: ndmfBuildContextInspect
description: "NDMF BuildContext detect"
category: ndmf-advanced
tags: [unity, vrcsdk]
params: []
kind: recipe
sync: sync
requires: [vrcsdk]
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.SceneManagement
try { var ctxType = AppDomain.CurrentDomain.GetAssemblies().SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } }).FirstOrDefault(x => x.FullName == "nadena.dev.ndmf.BuildContext"); return new { success = true, buildContextAvailable = ctxType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
