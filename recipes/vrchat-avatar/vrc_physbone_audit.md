---
name: vrc_physbone_audit
old_tool: vrc_physbone_audit
request_type: vrcPhysBoneAudit
description: "Audit VRCPhysBone components: count, total affected transforms, multi-child branch warnings (require Multi Child Type=Average/Ignore/First), duplicate VRCPhysBoneCollider paths."
category: vrchat-avatar
tags: [vrchat, physbone, audit, vrcsdk]
params:
  - {name: avatarName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: [vrcsdk]
qa: clean
---
```csharp
// requires-using: System.Reflection
// --- injected helper shims (from VRCAuditHandler.cs) ---
IEnumerable<Component> ComponentsByName(GameObject root, string typeName) {
            return root.GetComponentsInChildren<Component>(true).Where(c => c != null && c.GetType().Name == typeName);
        }
string GetFullPath(Transform t) {
            if (t == null) return "";
            var stack = new Stack<string>();
            while (t != null) { stack.Push(t.name); t = t.parent; }
            return string.Join("/", stack);
        }
GameObject ResolveAvatar(string name) {
            if (!string.IsNullOrEmpty(name))
            {
                var go = GameObject.Find(name);
                if (go != null) return go;
            }
            return Selection.activeGameObject;
        }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string avatarName = argd != null && argd.TryGetValue("avatarName", out var an) && an != null ? an.ToString() : null;
    var avatar = ResolveAvatar(avatarName);
    if (avatar == null) { return new { success = false, error = "avatar not found" };  }

    var pbs = ComponentsByName(avatar, "VRCPhysBone").ToList();
    var multiChildIssues = new List<Dictionary<string, object>>();
    int totalAffected = 0;

    foreach (var pb in pbs)
    {
        var rootField = pb.GetType().GetField("rootTransform");
        var root = (rootField?.GetValue(pb) as Transform) ?? pb.transform;
        var children = root.GetComponentsInChildren<Transform>(true).Where(t => t != root).ToList();
        int affected = children.Count;
        totalAffected += affected;

        var multiBranchTransforms = children.Where(t => t.childCount > 1 && t.GetComponentsInChildren<Transform>().Length > 2).Take(5).Select(t => GetFullPath(t)).ToList();

        if (multiBranchTransforms.Count > 0)
        {
            multiChildIssues.Add(new Dictionary<string, object>
            {
                ["componentPath"] = GetFullPath(pb.transform),
                ["rootPath"] = GetFullPath(root),
                ["affectedTransforms"] = affected,
                ["multiBranchSample"] = multiBranchTransforms,
                ["note"] = "Multi-child branches require Multi Child Type=Average/Ignore/First"
            });
        }
    }

    var pbColliders = ComponentsByName(avatar, "VRCPhysBoneCollider").ToList();
    var colliderPaths = pbColliders.Select(c => GetFullPath(c.transform)).GroupBy(p => p).Where(g => g.Count() > 1).Select(g => new { path = g.Key, count = g.Count() }).ToList();

    return new
    {
        success = true,
        avatar = avatar.name,
        physBoneCount = pbs.Count,
        physBoneColliderCount = pbColliders.Count,
        totalAffectedTransforms = totalAffected,
        multiChildIssues,
        duplicateColliderPaths = colliderPaths
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
