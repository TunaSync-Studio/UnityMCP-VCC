---
name: vrc_world_upload
old_tool: vrc_world_upload
request_type: vrcWorldUpload
description: "VRChat World upload flow (4-step recovery sequence). Bypasses VRC SDK Build & Publish async stall via VRCApi reflection direct invoke. Modes: subscribe (register MCPSigHook), trigger (fire RunExportSceneResource), poll (wait for sentinel), upload (UpdateWorldBundle), verify (GetWorld forceRefresh), full (all of the above sequentially)."
category: vrchat
tags: [vrchat, world, upload, sdk, reflection, redirect]
params:
  - {name: mode, type: string, required: false, desc: "enum: subscribe|trigger|poll|upload|verify|full"}
  - {name: worldId, type: string, required: false, desc: "blueprintId (wrld_...)"}
  - {name: sentinelPath, type: string, required: false, desc: "Sig capture sentinel path (default <project>/Temp/mcp-sig-capture.txt)"}
  - {name: bundlePath, type: string, required: false, desc: "(upload mode) .vrcw path captured from sentinel"}
  - {name: worldSignature, type: string, required: false, desc: "(upload mode) base64 signature captured from sentinel"}
  - {name: pollTimeoutSec, type: number, required: false, desc: ""}
kind: redirect
sync: sync
requires: []
qa: clean
---
```text
Superseded in v2. Use the MCP tool: vrc_upload {target:"world", dry_run:true} to validate,
then {target:"world", confirm:true} for a real upload (requires the human-created arm file;
AI agents must never create it - ask the operator to run tools\arm-vrc-upload.bat).
```
