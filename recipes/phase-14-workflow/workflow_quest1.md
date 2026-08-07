---
name: workflow_quest1
old_tool: workflow_quest1
request_type: workflowQuest1
description: "Phase 14 / workflow / WorkflowQuest1"
category: phase-14-workflow
tags: [unity, phase14]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.Animations, UnityEngine.UI
// --- injected helper shims (from Phase19RealHandler.cs) ---
GameObject Resolve(string n) { if (!string.IsNullOrEmpty(n)) { var g = GameObject.Find(n); if (g != null) return g; } return Selection.activeGameObject; }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    var avatar = Resolve(argd?.TryGetValue("avatarName", out var an) == true ? an?.ToString() : null);
    if (avatar == null) { return new { success = false, error = "avatar required" };  }
    var converterType = AppDomain.CurrentDomain.GetAssemblies().SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } }).FirstOrDefault(x => x.Name == "AvatarConverterSettings");
    bool hasConverter = converterType != null && avatar.GetComponent(converterType) != null;
    int questIncompatShader = avatar.GetComponentsInChildren<Renderer>(true).SelectMany(r => r.sharedMaterials.Where(m => m != null)).Count(m => !m.shader.name.StartsWith("VRChat/Mobile"));
    return new { success = true, avatar = avatar.name, hasVRCQuestToolsConverter = hasConverter, questIncompatibleShaderCount = questIncompatShader, ready = hasConverter && questIncompatShader == 0 };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
