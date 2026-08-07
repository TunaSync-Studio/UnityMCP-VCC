---
name: mcp_cache_status
old_tool: mcp_cache_status
request_type: mcpCacheStatus
description: "Temp dir cache size"
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
// --- injected helper shims (from Phase12BHandler.cs) ---
string ProjRoot() => Path.GetFullPath(Path.Combine(Application.dataPath, ".."));
// --- end shims ---
try { var tempDir = Path.Combine(ProjRoot(), "Temp"); var size = Directory.Exists(tempDir) ? Directory.GetFiles(tempDir, "*", SearchOption.TopDirectoryOnly).Sum(f => new FileInfo(f).Length) : 0L; return new { success = true, tempDirBytes = size, tempDir }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
