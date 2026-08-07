---
name: pathtracer_safe_bake
old_tool: pathtracer_safe_bake
request_type: pathTracerSafeBake
description: "Safely abort PathTracer bake stuck on R/W-disabled mesh AddGeometry exit-5 retry loop. Calls Lightmapping.Cancel(), strips ContributeGI flag from all MeshRenderers, sets bakedGI=false / realtimeGI=false. cancelOnly=true skips the strip phase (just stop the loop)."
category: lighting
tags: [unity, bake, pathtracer, abort]
params:
  - {name: cancelOnly, type: boolean, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, UnityEditor.SceneManagement
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    bool cancelOnly = argd != null && argd.TryGetValue("cancelOnly", out var co) && co != null && bool.TryParse(co.ToString(), out var coB) && coB;

    bool wasRunning = Lightmapping.isRunning;
    if (wasRunning) Lightmapping.Cancel();

    int strippedContributeGI = 0;
    if (!cancelOnly)
    {
        foreach (var root in EditorSceneManager.GetActiveScene().GetRootGameObjects())
        {
            foreach (var rend in root.GetComponentsInChildren<MeshRenderer>(true))
            {
                var so = new SerializedObject(rend);
                var prop = so.FindProperty("m_StaticEditorFlags");
                if (prop != null)
                {
                    int flags = prop.intValue;
                    int contributeGIBit = (int)StaticEditorFlags.ContributeGI;
                    if ((flags & contributeGIBit) != 0)
                    {
                        flags &= ~contributeGIBit;
                        prop.intValue = flags;
                        so.ApplyModifiedPropertiesWithoutUndo();
                        strippedContributeGI++;
                    }
                }
            }
        }

        Lightmapping.bakedGI = false;
        Lightmapping.realtimeGI = false;
    }

    return new
    {
        success = true,
        cancelled = wasRunning,
        strippedContributeGI,
        bakedGI = Lightmapping.bakedGI,
        realtimeGI = Lightmapping.realtimeGI,
        cancelOnly
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
