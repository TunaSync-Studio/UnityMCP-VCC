---
name: tilemap_palette_create
old_tool: tilemap_palette_create
request_type: tilemapPaletteCreate
description: "GridPalette type detect"
category: 2d-tilemap
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
try { var paletteType = FindType("UnityEditor.Tilemaps.GridPalette"); return new { success = true, paletteAvailable = paletteType != null }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
