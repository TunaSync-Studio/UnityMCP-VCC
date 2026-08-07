---
name: vrc_preupload_check
old_tool: vrc_preupload_check
request_type: vrcPreUploadCheck
description: "VRChat World pre-upload 13-point verify: VRCSceneDescriptor / SpawnPoints / ReferenceCamera / RespawnHeightY / PipelineManager.blueprintId / AudioListener count / EventSystem / scriptCompilationFailed / BuildTarget / ColorSpace / Lightmap state / Layer anomaly / InternalErrorShader. Returns errors[] + warnings[] + info{}."
category: vrchat
tags: [vrchat, world, preupload, validation, audit, redirect]
params: []
kind: redirect
sync: sync
requires: []
qa: clean
---
```text
Superseded in v2. Use the MCP tool: vrc_upload {target:"world", dry_run:true}
Coverage note (v2.3.7): the dry run checks SceneDescriptor / PipelineManager+blueprintId /
AudioListener count / spawns / ReferenceCamera / RespawnHeightY /
scriptCompilationFailed / BuildTarget / ColorSpace / thumbnail existence, and reports
info counts (audioListenerCount / canvasCount / eventSystemCount - a VRChat world
normally has no EventSystem; the client supplies input).
NOT covered (run manually if needed): Lightmap state, Layer anomaly, InternalErrorShader scan.
```
