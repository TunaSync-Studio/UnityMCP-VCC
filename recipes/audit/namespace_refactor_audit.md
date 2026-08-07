---
name: namespace_refactor_audit
old_tool: namespace_refactor_audit
request_type: namespaceRefactorAudit
description: "MonoScript count for namespace audit"
category: audit
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEngine.Tilemaps, UnityEngine.U2D
try { var scripts = AssetDatabase.FindAssets("t:MonoScript"); return new { success = true, monoScriptCount = scripts.Length }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
