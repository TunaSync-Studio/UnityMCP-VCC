---
name: editor_play_mode_toggle
old_tool: editor_play_mode_toggle
request_type: editorPlayModeToggle
description: "Toggle Editor Play / Stop, or query state. action: play / stop / toggle / status."
category: editor-control
tags: [unity, play, stop, redirect]
params:
  - {name: action, type: string, required: false, desc: "enum: play|stop|toggle|status"}
kind: redirect
sync: sync
requires: []
qa: clean
---
```text
Superseded in v2. Use execute_editor_command with this body:

EditorApplication.isPlaying = !EditorApplication.isPlaying;
return new { success = true, isPlaying = EditorApplication.isPlaying };
```
