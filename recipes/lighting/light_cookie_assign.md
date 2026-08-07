---
name: light_cookie_assign
old_tool: light_cookie_assign
request_type: lightCookieAssign
description: "Lights with cookie texture count"
category: lighting
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Build
try { var lights = UnityEngine.Object.FindObjectsByType<Light>(FindObjectsSortMode.None); int withCookie = lights.Count(l => l.cookie != null); return new { success = true, totalLights = lights.Length, lightsWithCookie = withCookie }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
