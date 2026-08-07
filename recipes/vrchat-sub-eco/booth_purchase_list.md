---
name: booth_purchase_list
old_tool: booth_purchase_list
request_type: boothPurchaseList
description: "BOOTH purchase list audit (line count of a plain-text export)"
category: vrchat-sub-eco
tags: [unity]
params:
  - {name: listPath, type: string, required: true, desc: "path to a plain-text BOOTH purchase export"}
kind: recipe
sync: sync
requires: []
qa: review
---
```csharp
// requires-using: System.IO, System.Reflection
try { var p = (string)args["listPath"]; if (string.IsNullOrEmpty(p)) { return new { success = false, error = "listPath required" }; } var exists = File.Exists(p); var lines = exists ? File.ReadAllLines(p).Length : 0; return new { success = true, listFile = p, exists, lineCount = lines }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
