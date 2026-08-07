---
name: uitoolkit_panel_settings
old_tool: uitoolkit_panel_settings
request_type: uitoolkitPanelSettings
description: "PanelSettings detect + count"
category: ui-ui-toolkit
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
try { var psType = FindType("UnityEngine.UIElements.PanelSettings"); var guids = psType != null ? AssetDatabase.FindAssets($"t:{psType.Name}") : new string[0]; return new { success = true, panelSettingsAvailable = psType != null, count = guids.Length }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
