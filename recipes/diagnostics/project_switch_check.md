---
name: project_switch_check
old_tool: project_switch_check
request_type: projectSwitchCheck
description: "Verify the connected Unity Editor is opened on the expected project. Pass expectedDataPath; tool returns currentDataPath and match=true|false. Detects when UnityMCPPlugin reconnected to a different project."
category: diagnostics
tags: [unity, project, switch, diff, redirect]
params:
  - {name: expectedDataPath, type: string, required: false, desc: "Expected Application.dataPath (...Project/Assets)"}
kind: redirect
sync: sync
requires: []
qa: clean
---
```text
Superseded in v2. Use: unity_health_check
```
