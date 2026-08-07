---
name: localization_locale_add
old_tool: localization_locale_add
request_type: localizationLocaleAdd
description: "Locale type detect"
category: localization
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEngine.Tilemaps, UnityEngine.U2D
// --- injected helper shims (from Phase11EHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try { var localeType = FindType("UnityEngine.Localization.Locale"); return new { success = true, localizationAvailable = localeType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
