---
name: vrc_avatar_upload
old_tool: vrc_avatar_upload
request_type: vrcAvatarUpload
description: "VRChat Avatar Build & Upload via IVRCSdkAvatarBuilderApi reflection direct invoke. Bypasses VRC SDK Build & Publish UI flow. Requires VRCSdkControlPanel + Avatar tab open."
category: vrchat-avatar
tags: [vrchat, avatar, upload, sdk3a, reflection, redirect]
params:
  - {name: avatarName, type: string, required: false, desc: "Avatar GameObject name (defaults to Selection)"}
  - {name: blueprintId, type: string, required: false, desc: "Existing blueprintId to update (omit for new avatar)"}
  - {name: releaseStatus, type: string, required: false, desc: "enum: private|public"}
kind: redirect
sync: sync
requires: []
qa: clean
---
```text
Superseded in v2. Use: vrc_upload {target:'avatar'}
```
