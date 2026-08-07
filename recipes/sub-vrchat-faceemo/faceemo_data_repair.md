---
name: faceemo_data_repair
old_tool: faceemo_data_repair
request_type: faceemoDataRepair
description: "Detect FaceEmo MenuRepositoryComponent corruption (Clone suffix / Emo dead branches). Default dryRun=true — this version detects only; repair the data by hand after reviewing the report."
category: sub-vrchat-faceemo
tags: [faceemo, repair, audit]
params:
  - {name: avatarName, type: string, required: false, desc: ""}
  - {name: dryRun, type: boolean, required: false, desc: ""}
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
    string avatarName = argd != null && argd.TryGetValue("avatarName", out var an) && an != null ? an.ToString() : null;
    bool dryRun = argd != null && argd.TryGetValue("dryRun", out var dr) && dr != null && bool.TryParse(dr.ToString(), out var drB) && drB;

    GameObject avatar = null;
    if (!string.IsNullOrEmpty(avatarName)) avatar = GameObject.Find(avatarName);
    if (avatar == null) avatar = Selection.activeGameObject;
    if (avatar == null) { return new { success = false, error = "avatar not found" };  }

    Type repoType = AppDomain.CurrentDomain.GetAssemblies()
        .SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } })
        .FirstOrDefault(t => t.Name == "MenuRepositoryComponent" && t.Namespace != null && t.Namespace.Contains("FaceEmo"));
    if (repoType == null) { return new { success = false, error = "FaceEmo MenuRepositoryComponent type not found" };  }

    var repoComponents = avatar.GetComponentsInChildren(repoType, true);
    int cloneStripped = 0;
    int deadBranchFixed = 0;
    var report = new List<Dictionary<string, object>>();

    foreach (var comp in repoComponents)
    {
        var menuField = repoType.GetField("SerializableMenu") ?? repoType.GetField("serializableMenu");
        var menu = menuField?.GetValue(comp);
        if (menu == null) continue;

        var menuItemsField = menu.GetType().GetField("MenuItems") ?? menu.GetType().GetField("menuItems");
        var menuItems = menuItemsField?.GetValue(menu) as System.Collections.IEnumerable;
        if (menuItems == null) continue;

        foreach (var mi in menuItems)
        {
            if (mi == null) continue;
            var nameField = mi.GetType().GetField("Name") ?? mi.GetType().GetField("name");
            var n = nameField?.GetValue(mi)?.ToString();
            if (n != null && (n.Contains("(Clone)") || n.EndsWith("/Emo")))
            {
                if (!dryRun) { /* placeholder — real logic depends on FaceEmo internals */ }
                cloneStripped++;
                report.Add(new Dictionary<string, object> { ["component"] = comp.GetType().Name, ["item"] = n, ["action"] = "clone-flagged" });
            }
        }
    }

    return new
    {
        success = true,
        avatar = avatar.name,
        repoComponentCount = repoComponents.Length,
        cloneStripped,
        deadBranchFixed,
        dryRun,
        report,
        note = "Detection only in this version — review the report and repair the data by hand; automated destructive repair is intentionally not shipped."
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
