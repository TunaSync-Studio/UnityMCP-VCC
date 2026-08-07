---
name: vrc_portal_setup
old_tool: vrc_portal_setup
request_type: vrcPortalSetup
description: "Spawn VRCPortalMarker GameObject. Optional targetWorldId (wrld_...) sets roomId."
category: vrchat-world
tags: [vrchat, portal]
params:
  - {name: targetWorldId, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.Reflection
// --- injected helper shims (from VRCWorldGimmickHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n); if (t != null) return t; } return null; }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string targetWorldId = argd?.TryGetValue("targetWorldId", out var tw) == true ? tw?.ToString() : null;

    var portalType = FindType("VRCPortalMarker") ?? FindType("VRC_PortalMarker");
    if (portalType == null) { return new { success = false, error = "VRCPortalMarker type not found" };  }

    var go = new GameObject("Portal");
    Undo.RegisterCreatedObjectUndo(go, "MCP portal");
    var portal = Undo.AddComponent(go, portalType);
    if (!string.IsNullOrEmpty(targetWorldId))
    {
        var idField = portalType.GetField("roomId");
        idField?.SetValue(portal, targetWorldId);
    }
    return new { success = true, name = go.name, targetWorldId };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
