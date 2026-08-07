---
name: shader_variant_collection
old_tool: shader_variant_collection
request_type: shaderVariantCollection
description: "ShaderVariantCollection list"
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
try { var guids = AssetDatabase.FindAssets("t:ShaderVariantCollection"); return new { success = true, count = guids.Length, paths = guids.Select(g => AssetDatabase.GUIDToAssetPath(g)).ToList() }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
