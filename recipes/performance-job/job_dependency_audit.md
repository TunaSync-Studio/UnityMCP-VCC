---
name: job_dependency_audit
old_tool: job_dependency_audit
request_type: jobDependencyAudit
description: "Unity.Jobs detect"
category: performance-job
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from Phase11DHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try { var jobsType = FindType("Unity.Jobs.JobHandle"); return new { success = true, jobSystemAvailable = jobsType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
