---
name: vrc_constraint_audit
old_tool: vrc_constraint_audit
request_type: vrcConstraintAudit
description: "Audit VRCConstraint 6 types (Aim/LookAt/Parent/Position/Rotation/Scale): count by type + broken Source references (SourceTransform null)."
category: vrchat-avatar
tags: [vrchat, constraint, audit]
params:
  - {name: avatarName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.Reflection
// --- injected helper shims (from VRCAuditHandler.cs) ---
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

    string[] constraintNames = { "VRCAimConstraint", "VRCLookAtConstraint", "VRCParentConstraint", "VRCPositionConstraint", "VRCRotationConstraint", "VRCScaleConstraint" };
    var byType = new Dictionary<string, int>();
    var brokenRefs = new List<Dictionary<string, object>>();

    foreach (var n in constraintNames) byType[n] = 0;

    foreach (var c in avatar.GetComponentsInChildren<Component>(true))
    {
        if (c == null) continue;
        var tn = c.GetType().Name;
        if (!constraintNames.Contains(tn)) continue;
        byType[tn] = byType[tn] + 1;

        var sourcesField = c.GetType().GetField("Sources");
        if (sourcesField != null)
        {
            var arr = sourcesField.GetValue(c) as System.Collections.IList;
            if (arr != null)
            {
                for (int i = 0; i < arr.Count; i++)
                {
                    var src = arr[i];
                    var srcTransformField = src.GetType().GetField("SourceTransform");
                    var srcT = srcTransformField?.GetValue(src) as Transform;
                    if (srcT == null)
                    {
                        brokenRefs.Add(new Dictionary<string, object>
                        {
                            ["constraintType"] = tn,
                            ["componentPath"] = GetFullPath(c.transform),
                            ["sourceIndex"] = i
                        });
                    }
                }
            }
        }
    }

    return new
    {
        success = true,
        avatar = avatar.name,
        countByType = byType,
        totalCount = byType.Values.Sum(),
        brokenRefCount = brokenRefs.Count,
        brokenRefs
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
