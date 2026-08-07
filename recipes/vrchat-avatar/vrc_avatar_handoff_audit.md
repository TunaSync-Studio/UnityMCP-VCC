---
name: vrc_avatar_handoff_audit
old_tool: vrc_avatar_handoff_audit
request_type: vrcAvatarHandoffAudit
description: "Comprehensive avatar audit: mesh count / material count / bone count / PhysBone count / shader list / InternalErrorShader detect."
category: vrchat-avatar
tags: [vrchat, audit, handoff, vrcsdk]
params:
  - {name: avatarName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: [vrcsdk]
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

    int meshCount = avatar.GetComponentsInChildren<SkinnedMeshRenderer>(true).Length + avatar.GetComponentsInChildren<MeshRenderer>(true).Length;
    int matCount = avatar.GetComponentsInChildren<Renderer>(true).SelectMany(r => r.sharedMaterials).Where(m => m != null).Distinct().Count();
    int boneCount = avatar.GetComponentsInChildren<Transform>(true).Length;

    var pbType = AppDomain.CurrentDomain.GetAssemblies()
        .SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } })
        .FirstOrDefault(tt => tt.Name == "VRCPhysBone");
    int pbCount = pbType != null ? avatar.GetComponentsInChildren(pbType, true).Length : 0;

    var shaders = avatar.GetComponentsInChildren<Renderer>(true).SelectMany(r => r.sharedMaterials).Where(m => m != null).Select(m => m.shader.name).Distinct().ToList();
    bool hasError = shaders.Any(s => s == "Hidden/InternalErrorShader");

    return new
    {
        success = true,
        avatar = avatar.name,
        meshRendererCount = meshCount,
        materialCount = matCount,
        boneCount,
        physBoneCount = pbCount,
        shaderCount = shaders.Count,
        shaders,
        hasInternalErrorShader = hasError,
        pcOk = matCount <= 100 && pbCount <= 256
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
