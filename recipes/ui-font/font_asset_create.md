---
name: font_asset_create
old_tool: font_asset_create
request_type: fontAssetCreate
description: "TMP_FontAsset detect"
category: ui-font
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
try { var tmpType = FindType("TMPro.TMP_FontAsset"); return new { success = true, tmpFontAssetAvailable = tmpType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
