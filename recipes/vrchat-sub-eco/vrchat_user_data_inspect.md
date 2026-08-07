---
name: vrchat_user_data_inspect
old_tool: vrchat_user_data_inspect
request_type: vrchatUserDataInspect
description: "VRChat LocalLow user data inspect"
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
try { var p = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "..", "LocalLow", "VRChat", "VRChat"); var exists = Directory.Exists(p); long size = 0; if (exists) { try { foreach (var f in Directory.GetFiles(p, "*", SearchOption.TopDirectoryOnly)) size += new FileInfo(f).Length; } catch { } } return new { success = true, userDataExists = exists, path = p, topLevelBytes = size }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
