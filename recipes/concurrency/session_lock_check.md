---
name: session_lock_check
old_tool: session_lock_check
request_type: sessionLockCheck
description: "Acquire / status / release a session lock at <project>/Temp/mcp-session.lock. Prevents parallel CC sessions from silently fighting over UnityMCP port :8080. actions: acquire (default), status, release. Auto-supersedes stale locks (default ttlMinutes=60)."
category: concurrency
tags: [unity, session, lock, parallel-cc, redirect]
params:
  - {name: sessionId, type: string, required: false, desc: "Caller's session UUID"}
  - {name: action, type: string, required: false, desc: "enum: acquire|status|release"}
  - {name: ttlMinutes, type: number, required: false, desc: ""}
kind: redirect
sync: sync
requires: []
qa: clean
---
```text
Superseded in v2. Use: session_lease {action:'status'}
```
