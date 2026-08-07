---
name: coverage_report
old_tool: coverage_report
request_type: coverageReport
description: "CodeCoverage package detect"
category: testing
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Build
// --- injected helper shims (from Phase11BHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try { var coverage = FindType("UnityEditor.TestTools.CodeCoverage.CodeCoveragePackage"); return new { success = true, codeCoverageInstalled = coverage != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
