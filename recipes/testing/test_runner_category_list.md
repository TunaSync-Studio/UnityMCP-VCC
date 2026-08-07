---
name: test_runner_category_list
old_tool: test_runner_category_list
request_type: testRunnerCategoryList
description: "TestRunnerApi availability"
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
try { var apiType = FindType("UnityEditor.TestTools.TestRunner.Api.TestRunnerApi"); return new { success = true, testRunnerApiAvailable = apiType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
