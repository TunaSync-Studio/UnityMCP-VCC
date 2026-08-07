---
name: vrc_expr_params_audit
old_tool: vrc_expr_params_audit
request_type: vrcExprParamsAudit
description: "Audit VRChat Expression Parameters: total bit count vs 256-bit network sync limit. Per-param type/synced flag. Int=8bit, Float=8bit, Bool=1bit (synced only)."
category: vrchat-avatar
tags: [vrchat, expressions, parameters, bits, audit]
params:
  - {name: avatarName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: review
---
```csharp
// requires-using: System.Reflection
// --- injected helper shims (from VRCAuditHandler.cs) ---
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

    var avatarDescType = avatar.GetComponentsInChildren<Component>(true)
        .Select(c => c?.GetType()).Where(t => t != null && t.Name == "VRCAvatarDescriptor").FirstOrDefault();
    if (avatarDescType == null) { return new { success = false, error = "VRCAvatarDescriptor not found" };  }

    var desc = avatar.GetComponentInChildren(avatarDescType);
    var expParamsField = desc.GetType().GetField("expressionParameters");
    var expParams = expParamsField?.GetValue(desc);
    if (expParams == null) { return new { success = false, error = "expressionParameters not assigned" };  }

    var paramsArrField = expParams.GetType().GetField("parameters");
    var paramsArr = paramsArrField?.GetValue(expParams) as Array;
    int totalBits = 0;
    int totalParams = 0;
    int syncedParams = 0;
    var details = new List<Dictionary<string, object>>();

    if (paramsArr != null)
    {
        foreach (var p in paramsArr)
        {
            if (p == null) continue;
            totalParams++;
            var nameField = p.GetType().GetField("name");
            var typeField = p.GetType().GetField("valueType");
            var syncedField = p.GetType().GetField("networkSynced");
            var name = nameField?.GetValue(p)?.ToString() ?? "";
            var typeVal = typeField?.GetValue(p);
            var typeName = typeVal?.ToString() ?? "";
            bool synced = syncedField != null ? (bool)syncedField.GetValue(p) : true;

            int bits = 0;
            if (typeName == "Int") bits = 8;
            else if (typeName == "Float") bits = 8;
            else if (typeName == "Bool") bits = 1;

            if (synced) { totalBits += bits; syncedParams++; }
            details.Add(new Dictionary<string, object>
            {
                ["name"] = name,
                ["type"] = typeName,
                ["synced"] = synced,
                ["bits"] = synced ? bits : 0
            });
        }
    }

    return new
    {
        success = true,
        avatar = avatar.name,
        totalParams,
        syncedParams,
        totalBits,
        bitLimit = 256,
        bitsRemaining = 256 - totalBits,
        overLimit = totalBits > 256,
        details
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
