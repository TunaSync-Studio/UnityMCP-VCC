---
name: vrc_poly_count_audit
old_tool: vrc_poly_count_audit
request_type: vrcPolyCountAudit
description: "Sum avatar triangle count + Quest/PC rating (Excellent/Good/Medium/Poor/VeryPoor)."
category: vrchat-avatar
tags: [vrchat, polycount, quest]
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

    int total = 0;
    foreach (var r in avatar.GetComponentsInChildren<Renderer>(true))
    {
        Mesh m = null;
        if (r is SkinnedMeshRenderer smr) m = smr.sharedMesh;
        else if (r is MeshRenderer && r.GetComponent<MeshFilter>() is MeshFilter mf) m = mf.sharedMesh;
        if (m != null) total += m.triangles.Length / 3;
    }
    int questExcellent = 7500, questGood = 10000, questMedium = 15000, questPoor = 20000;
    string questRating = total <= questExcellent ? "Excellent" : total <= questGood ? "Good" : total <= questMedium ? "Medium" : total <= questPoor ? "Poor" : "VeryPoor";
    int pcExcellent = 32000, pcGood = 70000, pcMedium = 70000;
    string pcRating = total <= pcExcellent ? "Excellent" : total <= pcGood ? "Good" : total <= pcMedium ? "Medium" : "Poor";
    return new { success = true, avatar = avatar.name, totalTriangles = total, questRating, pcRating };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
