---
name: lilycal_costume_audit
old_tool: lilycal_costume_audit
request_type: lilycalCostumeAudit
description: "Audit lilycalInventory CostumeChanger components on an avatar: detect decorative GameObjects registered in some costumes but missing from others (causes residual props after costume swap). Returns per-costume missing[] list."
category: vrchat-avatar
tags: [vrchat, lilycal, costume, audit, ma, vrcsdk]
params:
  - {name: avatarName, type: string, required: false, desc: "Avatar root GameObject name (defaults to Selection)"}
kind: recipe
sync: sync
requires: [vrcsdk]
qa: review
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from AvatarMAHandler.cs) ---
string GetFullPath(Transform t) {
            if (t == null) return "";
            var stack = new Stack<string>();
            while (t != null) { stack.Push(t.name); t = t.parent; }
            return string.Join("/", stack);
        }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string avatarName = argd != null && argd.TryGetValue("avatarName", out var an) && an != null ? an.ToString() : null;

    GameObject root = null;
    if (!string.IsNullOrEmpty(avatarName)) root = GameObject.Find(avatarName);
    if (root == null && Selection.activeGameObject != null) root = Selection.activeGameObject;
    if (root == null)
    {
        return new { success = false, error = "avatarName arg or Selection required" };

    }

    Type costumeChangerType = AppDomain.CurrentDomain.GetAssemblies()
        .SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } })
        .FirstOrDefault(t => t.Name == "CostumeChanger" && t.Namespace != null && t.Namespace.StartsWith("jp.lilxyzw.lilycalInventory"));

    if (costumeChangerType == null)
    {
        return new { success = false, error = "lilycalInventory.CostumeChanger type not found" };

    }

    var components = root.GetComponentsInChildren(costumeChangerType, true);
    var report = new List<Dictionary<string, object>>();

    foreach (var comp in components)
    {
        var costumesField = costumeChangerType.GetField("costumes");
        if (costumesField == null) continue;
        var costumes = costumesField.GetValue(comp) as Array;
        if (costumes == null) continue;

        // 全 costumes に登場する Object を collection
        var allObjs = new HashSet<UnityEngine.Object>();
        foreach (var c in costumes)
        {
            var paramsField = c.GetType().GetField("parametersPerMenu");
            if (paramsField == null) continue;
            var ppm = paramsField.GetValue(c);
            if (ppm == null) continue;
            var objsField = ppm.GetType().GetField("objects");
            if (objsField == null) continue;
            var objs = objsField.GetValue(ppm) as Array;
            if (objs == null) continue;
            foreach (var entry in objs)
            {
                var goField = entry.GetType().GetField("obj");
                if (goField == null) continue;
                var go = goField.GetValue(entry) as UnityEngine.Object;
                if (go != null) allObjs.Add(go);
            }
        }

        // 各 costume で漏れている GO を検出
        var costumeReports = new List<Dictionary<string, object>>();
        foreach (var c in costumes)
        {
            var nameField = c.GetType().GetField("menuName");
            var costumeName = nameField?.GetValue(c)?.ToString() ?? "(unnamed)";

            var paramsField = c.GetType().GetField("parametersPerMenu");
            var ppm = paramsField?.GetValue(c);
            var objsField = ppm?.GetType().GetField("objects");
            var objs = objsField?.GetValue(ppm) as Array;
            var present = new HashSet<UnityEngine.Object>();
            if (objs != null)
            {
                foreach (var entry in objs)
                {
                    var goField = entry.GetType().GetField("obj");
                    var go = goField?.GetValue(entry) as UnityEngine.Object;
                    if (go != null) present.Add(go);
                }
            }
            var missing = allObjs.Where(o => !present.Contains(o)).Select(o => o.name).ToList();
            costumeReports.Add(new Dictionary<string, object>
            {
                ["costumeName"] = costumeName,
                ["registeredCount"] = present.Count,
                ["missingCount"] = missing.Count,
                ["missing"] = missing
            });
        }

        var compTransform = (comp as Component)?.transform;
        report.Add(new Dictionary<string, object>
        {
            ["componentPath"] = compTransform != null ? GetFullPath(compTransform) : "(unknown)",
            ["costumeCount"] = costumes.Length,
            ["totalUniqueObjects"] = allObjs.Count,
            ["costumes"] = costumeReports
        });
    }

    int totalMissing = report.Sum(r => ((List<Dictionary<string, object>>)r["costumes"]).Sum(c => (int)c["missingCount"]));

    return new
    {
        success = true,
        avatarName = root.name,
        componentCount = components.Length,
        totalMissing,
        report
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message, stackTrace = e.StackTrace };
}
```
