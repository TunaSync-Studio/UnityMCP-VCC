---
name: shader_graph_property_set
old_tool: shader_graph_property_set
request_type: shaderGraphPropertySet
description: "Set Material exposed properties (float / Color [r,g,b,a]) referenced by a Shader Graph shader."
category: shader-vfx
tags: [unity, shadergraph, material]
params:
  - {name: materialPath, type: string, required: true, desc: ""}
  - {name: properties, type: object, required: true, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string materialPath = argd != null && argd.TryGetValue("materialPath", out var mp) ? mp?.ToString() : null;
    if (string.IsNullOrEmpty(materialPath)) { return new { success = false, error = "materialPath required" };  }
    var mat = AssetDatabase.LoadAssetAtPath<Material>(materialPath);
    if (mat == null) { return new { success = false, error = "material not found" };  }

    var props = (argd["properties"] as Newtonsoft.Json.Linq.JObject)?.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    int changed = 0;
    foreach (var kv in props)
    {
        if (!mat.HasProperty(kv.Key)) continue;
        if (kv.Value is double d) { mat.SetFloat(kv.Key, (float)d); changed++; }
        else if (kv.Value is long l) { mat.SetFloat(kv.Key, (float)l); changed++; }
        else if (kv.Value is Newtonsoft.Json.Linq.JArray ja && ja.Count == 4) { mat.SetColor(kv.Key, new Color(ja[0].ToObject<float>(), ja[1].ToObject<float>(), ja[2].ToObject<float>(), ja[3].ToObject<float>())); changed++; }
    }
    EditorUtility.SetDirty(mat);
    AssetDatabase.SaveAssets();

    return new { success = true, materialPath, shader = mat.shader.name, changed };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
