---
name: ndmf_pass_inspect
old_tool: ndmf_pass_inspect
request_type: ndmfPassInspect
description: "NDMF PluginBase detect"
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
try { var ndmfType = AppDomain.CurrentDomain.GetAssemblies().SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } }).FirstOrDefault(x => x.FullName == "nadena.dev.ndmf.PluginBase"); return new { success = true, ndmfPluginAvailable = ndmfType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
