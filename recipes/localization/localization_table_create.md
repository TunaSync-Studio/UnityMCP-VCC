---
name: localization_table_create
old_tool: localization_table_create
request_type: localizationTableCreate
description: "Verify Localization package presence + report tableName. Manual config via Window > Asset Management > Localization Tables."
category: localization
tags: [unity, localization]
params:
  - {name: tableName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
try
{
    var settingsType = AppDomain.CurrentDomain.GetAssemblies()
        .SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } })
        .FirstOrDefault(tt => tt.FullName == "UnityEngine.Localization.Settings.LocalizationSettings");

    if (settingsType == null) { return new { success = false, error = "Localization package not installed" };  }

    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string tableName = argd != null && argd.TryGetValue("tableName", out var tn) ? tn?.ToString() : "MCP_Strings";
    return new { success = true, tableName, note = "Localization package detected — manually configure via Window > Asset Management > Localization Tables." };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
