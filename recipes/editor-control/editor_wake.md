---
name: editor_wake
old_tool: editor_wake
request_type: editorWake
description: "Wake the Unity Editor window (SetForegroundWindow + ShowWindow restore). Required when EditorApplication.delayCall fails to fire while Editor is minimized. Returns wasMinimized + setForegroundResult."
category: editor-control
tags: [unity, editor, wake, foreground, minimize, redirect]
params: []
kind: redirect
sync: sync
requires: []
qa: clean
---
```text
Superseded in v2. Use: unity_health_check {wake:true}
```
