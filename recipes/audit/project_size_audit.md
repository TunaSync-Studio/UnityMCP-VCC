---
name: project_size_audit
old_tool: project_size_audit
request_type: projectSizeAudit
description: "Total Assets/ size in MB"
category: audit
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.SceneManagement
try { var dataPath = Application.dataPath; long size = 0; try { foreach (var f in Directory.GetFiles(dataPath, "*", SearchOption.AllDirectories)) size += new FileInfo(f).Length; } catch { } return new { success = true, dataPath, totalBytes = size, totalMB = size / 1024 / 1024 }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
