---
name: vrc_visemes_audit
old_tool: vrc_visemes_audit
request_type: vrcVisemesAudit
description: "Verify VRChat lip sync 15 viseme blendshape mapping (sil, PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, ih, oh, ou). Returns missing blendshape names that VRCAvatarDescriptor references but mesh doesn't have."
category: vrchat-avatar
tags: [vrchat, lipsync, visemes, audit]
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

    var lipSyncField = desc.GetType().GetField("lipSync");
    var lipSync = lipSyncField?.GetValue(desc)?.ToString();
    var visemesField = desc.GetType().GetField("VisemeBlendShapes");
    var blendshapes = visemesField?.GetValue(desc) as string[];
    var smrField = desc.GetType().GetField("VisemeSkinnedMesh");
    var smr = smrField?.GetValue(desc) as SkinnedMeshRenderer;

    int blendshapeCount = blendshapes?.Length ?? 0;
    int validCount = 0;
    var missingShapes = new List<string>();

    if (smr != null && blendshapes != null && smr.sharedMesh != null)
    {
        foreach (var bs in blendshapes)
        {
            if (string.IsNullOrEmpty(bs)) continue;
            if (smr.sharedMesh.GetBlendShapeIndex(bs) >= 0) validCount++;
            else missingShapes.Add(bs);
        }
    }

    return new
    {
        success = true,
        avatar = avatar.name,
        lipSyncMode = lipSync,
        skinnedMeshAssigned = smr != null,
        skinnedMeshName = smr != null ? smr.name : null,
        blendshapeCount,
        validCount,
        missingShapes,
        expected15 = blendshapeCount == 15,
        note = "VRChat lip sync expects 15 visemes (sil, PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, ih, oh, ou)"
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
