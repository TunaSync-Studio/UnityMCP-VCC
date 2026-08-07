---
name: burst_compile_audit
old_tool: burst_compile_audit
request_type: burstCompileAudit
description: "BurstCompiler detect"
category: performance-burst
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from Phase11CHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try { var burstType = FindType("Unity.Burst.BurstCompiler"); return new { success = true, burstInstalled = burstType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
