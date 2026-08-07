---
name: booth_unitypackage_import
old_tool: booth_unitypackage_import
request_type: boothUnitypackageImport
description: "Import a BOOTH .unitypackage via AssetDatabase.ImportPackage (delayCall-wrapped to avoid MCP timeout). interactive=false runs silent (recommended). Verify post-import by listing AssetDatabase.FindAssets / get_project_state_probe."
category: asset-database
tags: [vrchat, booth, unitypackage, import]
params:
  - {name: packagePath, type: string, required: true, desc: "Absolute path to .unitypackage"}
  - {name: interactive, type: boolean, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: review
---
```csharp
// requires-using: System.IO, UnityEditor.SceneManagement
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    if (argd == null || !argd.TryGetValue("packagePath", out var pp) || pp == null)
    {
        return new { success = false, error = "packagePath arg required" };

    }
    string pkgPath = pp.ToString();
    bool interactive = argd.TryGetValue("interactive", out var ia) && ia != null && bool.TryParse(ia.ToString(), out var iaB) && iaB;

    if (!File.Exists(pkgPath))
    {
        return new { success = false, error = $"file not found: {pkgPath}" };

    }

    // capture pre-import asset list to detect new files
    var preGuids = new HashSet<string>(AssetDatabase.FindAssets("t:Object").Take(100000));

    EditorApplication.delayCall += () =>
    {
        try { AssetDatabase.ImportPackage(pkgPath, interactive); }
        catch (Exception ex) { Debug.LogError("[MCP] ImportPackage EXC: " + ex.Message); }
    };

    return new
    {
        success = true,
        armed = true,
        packagePath = pkgPath,
        interactive,
        note = "Import triggered via delayCall. Use get_project_state_probe or asset list grep to verify post-import."
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
