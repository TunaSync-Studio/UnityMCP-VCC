---
name: gogoloco_install
old_tool: gogoloco_install
request_type: goGoLocoInstall
description: "Instantiate GoGoLoco prefab under target avatar. Requires GoGoLoco package in project (VPM or BOOTH)."
category: vrchat-avatar
tags: [vrchat, gogoloco, locomotion]
params:
  - {name: avatarName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from VRChatExtHandler.cs) ---
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

    var guids = AssetDatabase.FindAssets("GoGoLoco t:Prefab");
    if (guids.Length == 0) { return new { success = false, error = "GoGoLoco prefab not found in project (install via VPM/BOOTH)" };  }
    var path = AssetDatabase.GUIDToAssetPath(guids[0]);
    var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
    var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab, avatar.transform);
    Undo.RegisterCreatedObjectUndo(instance, "MCP GoGoLoco install");

    return new { success = true, avatar = avatar.name, prefabPath = path, instanceName = instance.name };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
