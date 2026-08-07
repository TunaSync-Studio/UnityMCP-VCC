---
name: console_log_filter
old_tool: console_log_filter
request_type: consoleLogFilter
description: "Read Unity Console window log entries with text filter. Reflection access UnityEditor.LogEntries."
category: diagnostics
tags: [unity, console, log, filter, redirect]
params:
  - {name: filterText, type: string, required: false, desc: "Substring filter"}
  - {name: logType, type: string, required: false, desc: "any / error / warning / log"}
  - {name: limit, type: number, required: false, desc: ""}
kind: redirect
sync: sync
requires: []
qa: clean
---
```text
Superseded in v2. Use: get_logs
```
