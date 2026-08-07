---
name: unity_health_check
old_tool: unity_health_check
request_type: unityHealthCheck
description: "One-shot health check: connection status, Editor PID, project path, scene name, Unity version, isCompiling, isPlaying. Use for fast triage (no large payload)."
category: diagnostics
tags: [unity, health, diagnostics, triage, redirect]
params: []
kind: redirect
sync: sync
requires: []
qa: clean
---
```text
Superseded in v2. Use the MCP tool: unity_health_check
(v2 answers with server{version,build,pid,startedAt}, project/port, editor pid,
evalEngine, features and sysStatus{compiling, playMode, jobs, lease} - a superset
of this legacy recipe. The legacy body referenced the v1-only UnityMCPConnection
type and cannot run on the v2 plugin.)
```
