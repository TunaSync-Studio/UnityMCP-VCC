---
name: vrc_menu_enum_fix
old_tool: vrc_menu_enum_fix
request_type: vrcMenuEnumFix
description: "Detect & repair VRCExpressionsMenu Control.ControlType non-sequential enum corruption. VRChat ControlType uses non-contiguous int values (Button=101, Toggle=102, SubMenu=103, TwoAxisPuppet=104, FourAxisPuppet=105, RadialPuppet=106) which can cause SerializedProperty.enumValueIndex=-1 and silently drop controls from NDMF. Tool sets enumValueIndex from intValue. dryRun=true reports without saving."
category: vrchat-avatar
tags: [vrchat, menu, expressions, enum, repair]
params:
  - {name: menuPath, type: string, required: false, desc: "AssetDatabase path to VRCExpressionsMenu (default scans entire project)"}
  - {name: dryRun, type: boolean, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: review
---
```csharp
// requires-using: System.IO, System.Reflection
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string menuPath = argd != null && argd.TryGetValue("menuPath", out var mp) && mp != null ? mp.ToString() : null;
    bool dryRun = argd != null && argd.TryGetValue("dryRun", out var dr) && dr != null && bool.TryParse(dr.ToString(), out var drB) && drB;

    List<UnityEngine.Object> targets = new List<UnityEngine.Object>();
    if (!string.IsNullOrEmpty(menuPath))
    {
        var asset = AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(menuPath);
        if (asset == null)
        {
            return new { success = false, error = $"menu asset not found at {menuPath}" };

        }
        targets.Add(asset);
    }
    else
    {
        var guids = AssetDatabase.FindAssets("t:VRCExpressionsMenu");
        foreach (var g in guids)
        {
            var path = AssetDatabase.GUIDToAssetPath(g);
            var a = AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(path);
            if (a != null) targets.Add(a);
        }
    }

    int totalControls = 0, badControls = 0, fixedControls = 0;
    var report = new List<Dictionary<string, object>>();

    foreach (var asset in targets)
    {
        var so = new SerializedObject(asset);
        var controls = so.FindProperty("controls");
        if (controls == null || !controls.isArray) continue;
        for (int i = 0; i < controls.arraySize; i++)
        {
            var control = controls.GetArrayElementAtIndex(i);
            var typeProp = control.FindPropertyRelative("type");
            if (typeProp == null) continue;
            totalControls++;
            if (typeProp.enumValueIndex == -1)
            {
                badControls++;
                int rawValue = typeProp.intValue;
                // VRChat ControlType: Button=101, Toggle=102, SubMenu=103, TwoAxisPuppet=104, FourAxisPuppet=105, RadialPuppet=106
                int targetIndex = -1;
                switch (rawValue)
                {
                    case 101: targetIndex = 0; break;
                    case 102: targetIndex = 1; break;
                    case 103: targetIndex = 2; break;
                    case 104: targetIndex = 3; break;
                    case 105: targetIndex = 4; break;
                    case 106: targetIndex = 5; break;
                }
                var entry = new Dictionary<string, object>
                {
                    ["assetPath"] = AssetDatabase.GetAssetPath(asset),
                    ["controlIndex"] = i,
                    ["rawIntValue"] = rawValue,
                    ["targetIndex"] = targetIndex,
                    ["fixed"] = false
                };
                if (!dryRun && targetIndex >= 0)
                {
                    typeProp.enumValueIndex = targetIndex;
                    entry["fixed"] = true;
                    fixedControls++;
                }
                report.Add(entry);
            }
        }
        if (!dryRun) so.ApplyModifiedProperties();
        if (!dryRun) EditorUtility.SetDirty(asset);
    }
    if (!dryRun) AssetDatabase.SaveAssets();

    return new
    {
        success = true,
        targetCount = targets.Count,
        totalControls,
        badControls,
        fixedControls,
        dryRun,
        report
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message, stackTrace = e.StackTrace };
}
```
