---
name: vrc_yamaplayer_install
old_tool: vrc_yamaplayer_install
request_type: vrcYamaPlayerInstall
description: "Instantiate YamaPlayer prefab into scene (koorimizuw/YamaPlayer). Requires YamaPlayer package via VPM."
category: vrchat-world
tags: [vrchat, yamaplayer, video]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.Reflection
try
{
    var guids = AssetDatabase.FindAssets("YamaPlayer t:Prefab");
    if (guids.Length == 0) { return new { success = false, error = "YamaPlayer prefab not found (install via VPM koorimizuw/YamaPlayer)" };  }

    var path = AssetDatabase.GUIDToAssetPath(guids[0]);
    var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
    var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
    Undo.RegisterCreatedObjectUndo(instance, "MCP YamaPlayer install");

    return new { success = true, prefabPath = path, instanceName = instance.name };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
