---
name: asset_orphan_finder
old_tool: asset_orphan_finder
request_type: assetOrphanFinder
description: "Orphan asset (not in build scenes) finder"
category: audit
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEngine.Tilemaps, UnityEngine.U2D
try { var allAssets = AssetDatabase.GetAllAssetPaths().Where(p => p.StartsWith("Assets/")).ToList(); int total = allAssets.Count; var sceneDeps = new HashSet<string>(); foreach (var scene in EditorBuildSettings.scenes.Where(s => s.enabled)) foreach (var dep in AssetDatabase.GetDependencies(scene.path, true)) sceneDeps.Add(dep); int orphans = allAssets.Count(a => !sceneDeps.Contains(a) && !a.EndsWith(".meta")); return new { success = true, totalAssets = total, sceneDependencies = sceneDeps.Count, potentialOrphans = orphans, note = "Orphan = not referenced by any enabled build scene. Editor scripts and Resources/ may show as orphan but are runtime-loadable." }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
