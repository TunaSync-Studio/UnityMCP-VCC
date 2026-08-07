---
name: vrc_quest_shader_audit
old_tool: vrc_quest_shader_audit
request_type: vrcQuestShaderAudit
description: "Detect non-Quest-allowed shaders on avatar materials (VRChat/Mobile/* whitelist)."
category: vrchat-quest
tags: [vrchat, quest, shader]
params:
  - {name: avatarName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from VRChatAdvHandler.cs) ---
GameObject Resolve(string n) { if (!string.IsNullOrEmpty(n)) { var g = GameObject.Find(n); if (g != null) return g; } return Selection.activeGameObject; }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    var avatar = Resolve(argd?.TryGetValue("avatarName", out var an) == true ? an?.ToString() : null);
    if (avatar == null) { return new { success = false, error = "avatar not found" };  }

    string[] questAllowed = { "VRChat/Mobile/Standard Lite", "VRChat/Mobile/Diffuse", "VRChat/Mobile/Bumped Diffuse", "VRChat/Mobile/Bumped Mapped Specular", "VRChat/Mobile/Toon Lit", "VRChat/Mobile/MatCap Lit", "VRChat/Mobile/Particles/Additive", "VRChat/Mobile/Particles/Multiply", "VRChat/Mobile/Skybox", "VRChat/Mobile/Lightmapped" };
    var nonQuest = new List<string>();
    int total = 0;
    foreach (var r in avatar.GetComponentsInChildren<Renderer>(true))
    {
        foreach (var m in r.sharedMaterials.Where(x => x != null && x.shader != null))
        {
            total++;
            if (!questAllowed.Contains(m.shader.name)) nonQuest.Add(m.shader.name);
        }
    }
    var unique = nonQuest.Distinct().ToList();
    return new { success = true, avatar = avatar.name, totalMaterials = total, nonQuestShaderCount = nonQuest.Count, uniqueNonQuestShaders = unique };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
