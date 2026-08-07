---
name: shader_keyword_enable_all
old_tool: shader_keyword_enable_all
request_type: shaderKeywordEnableAll
description: "Phase 13 / shader / ShaderKeywordEnableAll"
category: phase-13-shader
tags: [unity, phase13]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations, UnityEngine.UI
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string keyword = argd?.TryGetValue("keyword", out var k) == true ? k?.ToString() : null;
    string folder = argd?.TryGetValue("folder", out var f) == true ? f?.ToString() : null;
    if (string.IsNullOrEmpty(keyword)) { return new { success = false, error = "keyword required" };  }

    var guids = AssetDatabase.FindAssets("t:Material", folder != null ? new[] { folder } : null);
    int affected = 0;
    foreach (var g in guids)
    {
        var mat = AssetDatabase.LoadAssetAtPath<Material>(AssetDatabase.GUIDToAssetPath(g));
        if (mat == null) continue;
        mat.EnableKeyword(keyword);
        EditorUtility.SetDirty(mat);
        affected++;
    }
    AssetDatabase.SaveAssets();
    return new { success = true, keyword, affected };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
