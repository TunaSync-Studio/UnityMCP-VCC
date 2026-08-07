---
name: vrcft_facial_setup
old_tool: vrcft_facial_setup
request_type: vrcftFacialSetup
description: "Detect ARKit-compatible blendshapes on avatar SkinnedMeshRenderer + count match. Returns recommendation for non-destructive custom FX setup."
category: vrchat-avatar
tags: [vrchat, vrcft, facetracking]
params:
  - {name: avatarName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.Reflection
// --- injected helper shims (from ChimeraSyncHandler.cs) ---
GameObject ResolveGo(string name) {
            if (!string.IsNullOrEmpty(name)) { var go = GameObject.Find(name); if (go != null) return go; }
            return Selection.activeGameObject;
        }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    var avatar = ResolveGo(argd != null && argd.TryGetValue("avatarName", out var an) ? an?.ToString() : null);
    if (avatar == null) { return new { success = false, error = "avatar not found" };  }

    var smr = avatar.GetComponentsInChildren<SkinnedMeshRenderer>(true).FirstOrDefault(s => s.sharedMesh != null && s.sharedMesh.blendShapeCount > 0);
    if (smr == null) { return new { success = false, error = "no SkinnedMeshRenderer with blendshapes" };  }

    var blendshapes = new List<string>();
    for (int i = 0; i < smr.sharedMesh.blendShapeCount; i++) blendshapes.Add(smr.sharedMesh.GetBlendShapeName(i));

    string[] arkitNames = { "JawOpen", "MouthSmile", "EyeBlinkLeft", "EyeBlinkRight", "BrowDownLeft", "BrowDownRight", "BrowOuterUpLeft", "BrowOuterUpRight" };
    var matchingArkit = arkitNames.Where(n => blendshapes.Any(b => b.Contains(n) || b.Contains(n.ToLower()))).ToList();

    return new
    {
        success = true,
        avatar = avatar.name,
        smr = smr.name,
        totalBlendshapes = blendshapes.Count,
        matchingArkitCount = matchingArkit.Count,
        matchingArkit,
        note = "Build the VRCFT face tracking on a custom non-destructive FX layer; stock community template prefabs typically overwrite the avatar's FX controller in place."
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
