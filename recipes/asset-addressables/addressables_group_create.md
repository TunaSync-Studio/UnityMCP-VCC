---
name: addressables_group_create
old_tool: addressables_group_create
request_type: addressablesGroupCreate
description: "Create Addressable Asset Group via reflection."
category: asset-addressables
tags: [unity, addressables]
params:
  - {name: groupName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: review
---
```csharp
// requires-using: System.IO, System.Reflection
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string groupName = argd != null && argd.TryGetValue("groupName", out var gn) ? gn?.ToString() : "MCP_Group";

    var settingsType = AppDomain.CurrentDomain.GetAssemblies()
        .SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } })
        .FirstOrDefault(tt => tt.FullName == "UnityEditor.AddressableAssets.AddressableAssetSettingsDefaultObject");
    if (settingsType == null) { return new { success = false, error = "Addressables not installed" };  }

    var settings = settingsType.GetProperty("Settings", BindingFlags.Public | BindingFlags.Static)?.GetValue(null);
    if (settings == null) { return new { success = false, error = "Addressables Settings null" };  }

    var createGroupMethod = settings.GetType().GetMethod("CreateGroup", new[] { typeof(string), typeof(bool), typeof(bool), typeof(bool), typeof(System.Collections.Generic.List<>).MakeGenericType(AppDomain.CurrentDomain.GetAssemblies().SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } }).First(tt => tt.Name == "AddressableAssetGroupSchema")) });
    bool created = false;
    if (createGroupMethod != null) { try { createGroupMethod.Invoke(settings, new object[] { groupName, false, false, false, null }); created = true; } catch { } }

    return new { success = true, groupName, created };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
