---
name: urp_renderer_inspect
old_tool: urp_renderer_inspect
request_type: urpRendererInspect
description: "Detect URP installation + report current Render Pipeline."
category: rendering-urp
tags: [unity, urp]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.Reflection
// --- injected helper shims (from URPHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try
{
    var rpAssetType = FindType("UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset");
    bool urpInstalled = rpAssetType != null;
    var currentRP = UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline;
    return new
    {
        success = true,
        urpInstalled,
        currentRenderPipeline = currentRP != null ? currentRP.GetType().Name : "(BuiltIn)",
        isURP = currentRP != null && currentRP.GetType().Name.Contains("Universal")
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
