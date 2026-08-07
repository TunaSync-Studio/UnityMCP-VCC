---
name: texture_compress_quest
old_tool: texture_compress_quest
request_type: textureCompressQuest
description: "Batch-set Android (Quest) texture import settings: maxSize + format (ASTC_6x6 default). Required for Quest avatar 10MB compliance."
category: texture
tags: [unity, texture, quest, android, astc]
params:
  - {name: folderFilter, type: string, required: false, desc: ""}
  - {name: maxSize, type: number, required: false, desc: ""}
  - {name: format, type: string, required: false, desc: "TextureImporterFormat enum name"}
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
    string folderFilter = argd != null && argd.TryGetValue("folderFilter", out var ff) && ff != null ? ff.ToString() : null;
    int maxSize = 1024;
    if (argd != null && argd.TryGetValue("maxSize", out var ms) && ms != null) int.TryParse(ms.ToString(), out maxSize);
    string format = argd != null && argd.TryGetValue("format", out var fm) && fm != null ? fm.ToString() : "ASTC_6x6";

    var texGuids = AssetDatabase.FindAssets("t:Texture2D", folderFilter != null ? new[] { folderFilter } : null);
    int affected = 0;
    foreach (var g in texGuids)
    {
        var path = AssetDatabase.GUIDToAssetPath(g);
        var importer = AssetImporter.GetAtPath(path) as TextureImporter;
        if (importer == null) continue;

        var androidSettings = importer.GetPlatformTextureSettings("Android");
        androidSettings.overridden = true;
        androidSettings.maxTextureSize = maxSize;

        if (Enum.TryParse<TextureImporterFormat>(format, out var fmt))
            androidSettings.format = fmt;

        importer.SetPlatformTextureSettings(androidSettings);
        importer.SaveAndReimport();
        affected++;
    }

    return new
    {
        success = true,
        affected,
        maxSize,
        format,
        folderFilter
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
