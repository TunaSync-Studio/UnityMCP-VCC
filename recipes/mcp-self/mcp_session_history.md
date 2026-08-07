---
name: mcp_session_history
old_tool: mcp_session_history
request_type: mcpSessionHistory
description: "Session lock file status"
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
try { var sessionFile = Path.Combine(ProjRoot(), "Temp", "mcp-session.lock"); return new { success = true, sessionLockExists = File.Exists(sessionFile), lockFile = sessionFile }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
