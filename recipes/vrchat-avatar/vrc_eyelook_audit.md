---
name: vrc_eyelook_audit
old_tool: vrc_eyelook_audit
request_type: vrcEyeLookAudit
description: "Verify VRChat Eye Look bone configuration: enabled flag + leftEye/rightEye Transform assignments."
category: vrchat-avatar
tags: [vrchat, eyelook, audit]
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

    var desc = avatar.GetComponentsInChildren<Component>(true).FirstOrDefault(c => c?.GetType().Name == "VRCAvatarDescriptor");
    if (desc == null) { return new { success = false, error = "VRCAvatarDescriptor not found" };  }

    var enableField = desc.GetType().GetField("enableEyeLook");
    bool enabled = enableField != null ? (bool)enableField.GetValue(desc) : false;

    var settingsField = desc.GetType().GetField("customEyeLookSettings");
    var settings = settingsField?.GetValue(desc);
    Transform leftEye = null, rightEye = null;
    if (settings != null)
    {
        var leftField = settings.GetType().GetField("leftEye");
        var rightField = settings.GetType().GetField("rightEye");
        leftEye = leftField?.GetValue(settings) as Transform;
        rightEye = rightField?.GetValue(settings) as Transform;
    }

    return new
    {
        success = true,
        avatar = avatar.name,
        enabled,
        leftEyeAssigned = leftEye != null,
        rightEyeAssigned = rightEye != null,
        leftEyePath = leftEye != null ? GetFullPath(leftEye) : null,
        rightEyePath = rightEye != null ? GetFullPath(rightEye) : null
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
