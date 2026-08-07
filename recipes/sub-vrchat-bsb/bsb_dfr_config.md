---
name: bsb_dfr_config
old_tool: bsb_dfr_config
request_type: bsbDfrConfig
description: "Verify BigScreen Beyond 2e DFR / EyetrackingAddon / Quad-Views-Foveated installation status (file system check). Editor scope only — runtime DFR toggle requires OVRAS keybind (not from Unity)."
category: sub-vrchat-bsb
tags: [bsb, dfr, eyetracking]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
try
{
    var bsbDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "..", "LocalLow", "BigScreenVR", "Beyond");
    var addonsDir = Path.Combine(bsbDir, "BeyondAddons");

    var present = new Dictionary<string, bool>();
    var addonPaths = new[] { "BeyondUtility", "EyetrackingAddon", "Quad-Views-Foveated", "DFR" };
    if (Directory.Exists(addonsDir))
    {
        foreach (var n in addonPaths)
        {
            present[n] = Directory.Exists(Path.Combine(addonsDir, n)) || Directory.GetFiles(addonsDir, n + "*", SearchOption.TopDirectoryOnly).Length > 0;
        }
    }
    else
    {
        foreach (var n in addonPaths) present[n] = false;
    }

    return new
    {
        success = Directory.Exists(bsbDir),
        bsbDirExists = Directory.Exists(bsbDir),
        addonsDirExists = Directory.Exists(addonsDir),
        bsbDir,
        addonsDir,
        addonsPresent = present,
        note = "Editor scope only — runtime DFR toggle requires OVRAS keybind."
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
