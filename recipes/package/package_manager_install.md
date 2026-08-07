---
name: package_manager_install
old_tool: package_manager_install
request_type: packageManagerInstall
description: "UnityEditor.PackageManager.Client.Add(identifier). Pass package id (com.unity.x) or git URL."
category: package
tags: [unity, upm, package]
params:
  - {name: identifier, type: string, required: true, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.PackageManager, UnityEditor.PackageManager.Requests
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string identifier = argd != null && argd.TryGetValue("identifier", out var id) ? id?.ToString() : null;
    if (string.IsNullOrEmpty(identifier)) { return new { success = false, error = "identifier required" };  }

    var req = Client.Add(identifier);
    return new { success = true, armed = true, identifier, note = "Package install initiated. Check Package Manager for completion." };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
