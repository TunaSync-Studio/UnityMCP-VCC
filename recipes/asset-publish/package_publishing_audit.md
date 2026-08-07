---
name: package_publishing_audit
old_tool: package_publishing_audit
request_type: packagePublishingAudit
description: "Asset Store publishing window detect"
category: asset-publish
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
try { var publisherType = FindType("UnityEditor.PackageManager.UI.PackagePublishingWindow"); return new { success = true, publishingWindowAvailable = publisherType != null, note = "Asset Store publishing via Asset Store Tools package." }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
