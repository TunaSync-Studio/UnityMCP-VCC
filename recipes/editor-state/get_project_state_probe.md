---
name: get_project_state_probe
old_tool: get_project_state_probe
request_type: getProjectStateProbe
description: "Lightweight (<3KB) project state probe written to Temp/mcp-probe.json. Avoids the get_editor_state 2MB+ problem and the EditorApplication.delayCall minimize-fire-failure. Returns projectPath, sceneName, rootCount, isDirty, buildTarget, colorSpace, unityVersion, isPlaying, isCompiling."
category: editor-state
tags: [unity, probe, lightweight, state, redirect]
params: []
kind: redirect
sync: sync
requires: []
qa: clean
---
```text
Superseded in v2. Use: unity_health_check {verbose:true}
```
