---
name: kono_asset_index_status
old_tool: kono_asset_index_status
request_type: konoAssetIndexStatus
description: "Asset library directory category count"
category: vrchat-sub-eco
tags: [unity]
params:
  - {name: assetRoot, type: string, required: true, desc: "asset library root directory"}
kind: recipe
sync: sync
requires: []
qa: review
---
```csharp
// requires-using: System.IO, System.Reflection
try { var p = (string)args["assetRoot"]; if (string.IsNullOrEmpty(p)) { return new { success = false, error = "assetRoot required" }; } var exists = Directory.Exists(p); int dirs = exists ? Directory.GetDirectories(p).Length : 0; return new { success = true, assetRoot = p, exists, categoryCount = dirs }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
