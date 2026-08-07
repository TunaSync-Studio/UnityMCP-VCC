---
name: unity_cloud_status
old_tool: unity_cloud_status
request_type: unityCloudStatus
description: "CloudProjectSettings (projectId/orgId)"
category: cloud
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEngine.Tilemaps, UnityEngine.U2D
try { return new { success = true, projectId = CloudProjectSettings.projectId, organizationId = CloudProjectSettings.organizationId, projectName = CloudProjectSettings.projectName }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
