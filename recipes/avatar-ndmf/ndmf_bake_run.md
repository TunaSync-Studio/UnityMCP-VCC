---
name: ndmf_bake_run
old_tool: ndmf_bake_run
request_type: ndmfBakeRun
description: "Run NDMF (nadena.dev.ndmf.AvatarProcessor) Manual Bake on the target avatar via EditorApplication.delayCall fire-and-forget. Avoids MCP execute-timeout on long bakes. Caller polls Unity logs for [NDMF Done] sentinel after."
category: avatar-ndmf
tags: [vrchat, avatar, ndmf, bake, ma, vrcsdk]
params:
  - {name: avatarName, type: string, required: false, desc: "GameObject.Find target (defaults to Selection)"}
kind: recipe
sync: sync
requires: [vrcsdk]
qa: review
---
```csharp
// requires-using: System.IO, UnityEditor.SceneManagement
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string targetGoName = argd != null && argd.TryGetValue("avatarName", out var an) && an != null ? an.ToString() : null;

    var ndmfBuildContext = AppDomain.CurrentDomain.GetAssemblies()
        .SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } })
        .FirstOrDefault(t => t.FullName == "nadena.dev.ndmf.AvatarProcessor");

    if (ndmfBuildContext == null)
    {
        return new { success = false, error = "NDMF AvatarProcessor type not found" };

    }

    GameObject targetGo = null;
    if (!string.IsNullOrEmpty(targetGoName))
    {
        targetGo = GameObject.Find(targetGoName);
    }
    if (targetGo == null && Selection.activeGameObject != null) targetGo = Selection.activeGameObject;

    if (targetGo == null)
    {
        return new { success = false, error = "No target GameObject (avatarName arg or Selection)" };

    }

    var processOnPlay = ndmfBuildContext.GetMethods(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static)
        .FirstOrDefault(mi => mi.Name == "ProcessAvatar" || mi.Name == "ManualBakeAvatar");
    if (processOnPlay == null)
    {
        return new { success = false, error = "NDMF ProcessAvatar/ManualBakeAvatar method not found" };

    }

    EditorApplication.delayCall += () =>
    {
        try
        {
            processOnPlay.Invoke(null, new object[] { targetGo });
            Debug.Log("[MCP][NDMF Done] avatar=" + targetGo.name);
        }
        catch (Exception ex) { Debug.LogError("[MCP][NDMF EXC] " + ex.Message); }
    };

    return new { success = true, armed = true, target = targetGo.name, methodUsed = processOnPlay.Name };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
