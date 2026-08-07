---
name: material_property_set
old_tool: material_property_set
request_type: materialPropertySet
description: "Batch-set material properties (float / Color [r,g,b,a]). Useful for lilToon batch tuning. Color must be 4-element array [r,g,b,a]; unsupported value types are reported as skipped, never silently altered."
category: material
tags: [unity, material, lilToon, batch]
params:
  - {name: materialPaths, type: array, required: true, desc: ""}
  - {name: properties, type: object, required: true, desc: "{\"_propName\": value, \"_color\": [1,0.5,0,1]}"}
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
    if (argd == null || !argd.TryGetValue("materialPaths", out var mpObj) || mpObj == null)
    {
        return new { success = false, error = "materialPaths array required" };

    }
    var materialPaths = (mpObj as Newtonsoft.Json.Linq.JArray)?.Select(t => t.ToString()).ToList() ?? new List<string>();

    if (!argd.TryGetValue("properties", out var propsObj) || propsObj == null)
    {
        return new { success = false, error = "properties dict required" };

    }
    var props = (propsObj as Newtonsoft.Json.Linq.JObject)?.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();

    int affected = 0;
    var report = new List<Dictionary<string, object>>();
    foreach (var mp in materialPaths)
    {
        var mat = AssetDatabase.LoadAssetAtPath<Material>(mp);
        if (mat == null) { report.Add(new Dictionary<string, object> { ["path"] = mp, ["success"] = false, ["error"] = "not found" }); continue; }
        int changed = 0;
        var skipped = new List<string>();
        foreach (var kv in props)
        {
            string name = kv.Key;
            var val = kv.Value;
            if (!mat.HasProperty(name)) { skipped.Add(name + " (no such property)"); continue; }
            if (val is double d) { mat.SetFloat(name, (float)d); changed++; }
            else if (val is long l) { mat.SetFloat(name, (float)l); changed++; }
            else if (val is Newtonsoft.Json.Linq.JArray ja && ja.Count == 4)
            {
                var c = new Color(ja[0].ToObject<float>(), ja[1].ToObject<float>(), ja[2].ToObject<float>(), ja[3].ToObject<float>());
                mat.SetColor(name, c);
                changed++;
            }
            else { skipped.Add(name + " (unsupported value type - use float or [r,g,b,a])"); }
        }
        EditorUtility.SetDirty(mat);
        report.Add(new Dictionary<string, object> { ["path"] = mp, ["success"] = true, ["changedProps"] = changed, ["skippedProps"] = skipped });
        affected++;
    }
    AssetDatabase.SaveAssets();

    return new
    {
        success = true,
        materialCount = materialPaths.Count,
        affected,
        report
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
