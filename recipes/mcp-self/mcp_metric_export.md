---
name: mcp_metric_export
old_tool: mcp_metric_export
request_type: mcpMetricExport
description: "Editor process metrics (PID/memory/threads)"
category: mcp-self
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
try { var proc = System.Diagnostics.Process.GetCurrentProcess(); return new { success = true, editorPid = proc.Id, workingSetMB = proc.WorkingSet64 / 1024 / 1024, threadCount = proc.Threads.Count }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
