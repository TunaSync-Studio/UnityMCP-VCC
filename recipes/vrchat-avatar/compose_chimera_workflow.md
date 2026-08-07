---
name: compose_chimera_workflow
old_tool: compose_chimera_workflow
request_type: composeChimeraWorkflow
description: "Orchestration template for chimera avatar (head from one base, body from another). Returns step-by-step plan + MA MergeArmature type discovery + audit suggestions. Non-destructive — manual confirm steps."
category: vrchat-avatar
tags: [vrchat, chimera, orchestration, vrcsdk]
params:
  - {name: baseAvatar, type: string, required: true, desc: ""}
  - {name: sourceHead, type: string, required: true, desc: ""}
kind: recipe
sync: sync
requires: [vrcsdk]
qa: clean
---
```csharp
// requires-using: System.Reflection
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string baseAvatarName = argd != null && argd.TryGetValue("baseAvatar", out var ba) ? ba?.ToString() : null;
    string sourceHeadName = argd != null && argd.TryGetValue("sourceHead", out var sh) ? sh?.ToString() : null;
    if (string.IsNullOrEmpty(baseAvatarName) || string.IsNullOrEmpty(sourceHeadName)) { return new { success = false, error = "baseAvatar + sourceHead required" };  }

    var baseAvatar = GameObject.Find(baseAvatarName);
    var sourceHead = GameObject.Find(sourceHeadName);
    if (baseAvatar == null || sourceHead == null) { return new { success = false, error = "baseAvatar or sourceHead not found" };  }

    var report = new List<string>();
    report.Add($"[Step 1] Located base avatar: {baseAvatar.name}");
    report.Add($"[Step 2] Located source head: {sourceHead.name}");

    var maType = AppDomain.CurrentDomain.GetAssemblies()
        .SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } })
        .FirstOrDefault(tt => tt.Name == "MAMergeArmature" || tt.Name == "ModularAvatarMergeArmature");
    if (maType != null) report.Add($"[Step 3] MA MergeArmature type available: {maType.FullName}");
    else report.Add("[Step 3] MA MergeArmature type NOT FOUND");

    report.Add("[Step 4] Manual: drag sourceHead under baseAvatar.Armature.Hips and add MAMergeArmature");
    report.Add("[Step 5] Manual: configure FaceEmo MenuRepositoryComponent for new head visemes");
    report.Add("[Step 6] Run vrc_visemes_audit + vrc_avatar_handoff_audit + vrc_avatar_build_size to verify");

    return new
    {
        success = true,
        baseAvatar = baseAvatar.name,
        sourceHead = sourceHead.name,
        steps = report,
        note = "Orchestration template — destructive ops require user confirmation."
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
