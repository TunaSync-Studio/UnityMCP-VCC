---
name: vrc_avatar_test_pedestal
old_tool: vrc_avatar_test_pedestal
request_type: vrcAvatarTestPedestal
description: "Spawn VRCAvatarPedestal GameObject with blueprintId — test avatar in world."
category: vrchat-world
tags: [vrchat, pedestal]
params:
  - {name: blueprintId, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.Reflection
// --- injected helper shims (from VRCWorldExtHandler.cs) ---
Type FindType(string name) {
            foreach (var a in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type[] types; try { types = a.GetTypes(); } catch { continue; }
                var t = types.FirstOrDefault(x => x.Name == name || x.FullName == name);
                if (t != null) return t;
            }
            return null;
        }
// --- end shims ---
try
{
    var pedestalType = FindType("VRCAvatarPedestal");
    if (pedestalType == null) { return new { success = false, error = "VRCAvatarPedestal type not found" };  }

    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string blueprintId = argd != null && argd.TryGetValue("blueprintId", out var bp) ? bp?.ToString() : "avtr_test";

    var go = new GameObject("Avatar Pedestal");
    Undo.RegisterCreatedObjectUndo(go, "MCP pedestal");
    var pedestal = Undo.AddComponent(go, pedestalType);
    var idField = pedestalType.GetField("blueprintId");
    idField?.SetValue(pedestal, blueprintId);

    return new { success = true, name = go.name, blueprintId };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
