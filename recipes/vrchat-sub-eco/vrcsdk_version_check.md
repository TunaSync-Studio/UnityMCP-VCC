---
name: vrcsdk_version_check
old_tool: vrcsdk_version_check
request_type: vrcsdkVersionCheck
description: "com.vrchat.base package.json version"
category: vrchat-sub-eco
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from Phase12AHandler.cs) ---
string ProjRoot() => Path.GetFullPath(Path.Combine(Application.dataPath, ".."));
// --- end shims ---
try { string version = "(unknown)"; var pkgPath = Path.Combine(ProjRoot(), "Packages", "com.vrchat.base", "package.json"); if (File.Exists(pkgPath)) { try { var json = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); if (json != null && json.TryGetValue("version", out var v)) version = v?.ToString(); } catch { } } return new { success = true, vrcsdkBaseVersion = version, packagePath = pkgPath, exists = File.Exists(pkgPath) }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
