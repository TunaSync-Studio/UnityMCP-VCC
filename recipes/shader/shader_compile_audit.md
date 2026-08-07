---
name: shader_compile_audit
old_tool: shader_compile_audit
request_type: shaderCompileAudit
description: "Total shader count"
category: shader
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
try { var shaders = AssetDatabase.FindAssets("t:Shader"); return new { success = true, totalShaders = shaders.Length }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
