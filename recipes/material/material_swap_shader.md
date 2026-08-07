---
name: material_swap_shader
old_tool: material_swap_shader
request_type: materialSwapShader
description: "Batch-swap material.shader to targetShader for all materials matching fromShader filter. Useful for InternalErrorShader recovery or PC→Quest shader migration."
category: material
tags: [unity, material, shader, batch]
params:
  - {name: targetShader, type: string, required: true, desc: "Shader name (e.g. \"lilToon\")"}
  - {name: fromShader, type: string, required: false, desc: "Filter: only swap if current shader matches this name"}
  - {name: folderFilter, type: string, required: false, desc: "Restrict to folder (e.g. Assets/Materials)"}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    if (argd == null || !argd.TryGetValue("targetShader", out var ts) || ts == null)
    {
        return new { success = false, error = "targetShader required" };

    }
    string targetShader = ts.ToString();
    string fromShader = argd.TryGetValue("fromShader", out var fs) && fs != null ? fs.ToString() : null;
    string folderFilter = argd.TryGetValue("folderFilter", out var ff) && ff != null ? ff.ToString() : null;

    var newShader = Shader.Find(targetShader);
    if (newShader == null) { return new { success = false, error = $"Shader.Find failed for: {targetShader}" };  }

    var matGuids = AssetDatabase.FindAssets("t:Material", folderFilter != null ? new[] { folderFilter } : null);
    int affected = 0;
    int total = matGuids.Length;
    foreach (var g in matGuids)
    {
        var path = AssetDatabase.GUIDToAssetPath(g);
        var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
        if (mat == null) continue;
        if (fromShader != null && mat.shader.name != fromShader) continue;
        Undo.RecordObject(mat, "MCP shader swap");
        mat.shader = newShader;
        EditorUtility.SetDirty(mat);
        affected++;
    }
    AssetDatabase.SaveAssets();

    return new
    {
        success = true,
        totalMaterials = total,
        affected,
        targetShader,
        fromShaderFilter = fromShader,
        folderFilter
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
