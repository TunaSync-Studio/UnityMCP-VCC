---
name: fbx_import_settings_batch
old_tool: fbx_import_settings_batch
request_type: fbxImportSettingsBatch
description: "Batch update ModelImporter.animationType + avatarSetup for all .fbx in folder."
category: asset-import
tags: [unity, fbx, import]
params:
  - {name: folder, type: string, required: false, desc: ""}
  - {name: animationType, type: string, required: false, desc: "ModelImporterAnimationType enum (Generic / Human / Legacy / None)"}
  - {name: rigType, type: string, required: false, desc: "ModelImporterAvatarSetup enum"}
kind: recipe
sync: job
requires: []
qa: clean
---
```csharp
// requires-using: System.IO
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string folder = argd?.TryGetValue("folder", out var f) == true ? f?.ToString() : null;
    string animationType = argd?.TryGetValue("animationType", out var at) == true ? at?.ToString() : null;
    string rigType = argd?.TryGetValue("rigType", out var rt) == true ? rt?.ToString() : null;

    var guids = AssetDatabase.FindAssets("t:Model", folder != null ? new[] { folder } : null);
    int affected = 0;
    foreach (var g in guids)
    {
        var path = AssetDatabase.GUIDToAssetPath(g);
        var importer = AssetImporter.GetAtPath(path) as ModelImporter;
        if (importer == null) continue;
        bool changed = false;
        if (!string.IsNullOrEmpty(animationType) && Enum.TryParse<ModelImporterAnimationType>(animationType, out var atE)) { importer.animationType = atE; changed = true; }
        if (!string.IsNullOrEmpty(rigType) && Enum.TryParse<ModelImporterAvatarSetup>(rigType, out var rtE)) { importer.avatarSetup = rtE; changed = true; }
        if (changed) { importer.SaveAndReimport(); affected++; }
    }
    return new { success = true, affected };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
