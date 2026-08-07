---
name: shader_keyword_set
old_tool: shader_keyword_set
request_type: shaderKeywordSet
description: "Material shader keyword Enable/Disable"
category: shader
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string materialPath = argd?.TryGetValue("materialPath", out var mp) == true ? mp?.ToString() : null; string keyword = argd?.TryGetValue("keyword", out var k) == true ? k?.ToString() : null; bool enable = argd?.TryGetValue("enable", out var en) == true && bool.Parse(en?.ToString() ?? "true"); if (string.IsNullOrEmpty(materialPath) || string.IsNullOrEmpty(keyword)) { return new { success = false, error = "materialPath + keyword required" };  } var mat = AssetDatabase.LoadAssetAtPath<Material>(materialPath); if (mat == null) { return new { success = false, error = "material not found" };  } if (enable) mat.EnableKeyword(keyword); else mat.DisableKeyword(keyword); EditorUtility.SetDirty(mat); AssetDatabase.SaveAssets(); return new { success = true, materialPath, keyword, enabled = enable }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
