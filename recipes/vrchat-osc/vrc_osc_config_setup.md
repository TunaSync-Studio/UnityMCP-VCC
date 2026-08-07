---
name: vrc_osc_config_setup
old_tool: vrc_osc_config_setup
request_type: vrcOSCConfigSetup
description: "Detect VRChat OSC config dir at LocalLow/VRChat/VRChat/OSC/<userId>/Avatars/<blueprintId>.json + count avatars."
category: vrchat-osc
tags: [vrchat, osc]
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
    var localLow = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "..", "LocalLow", "VRChat", "VRChat", "OSC");
    bool oscDirExists = Directory.Exists(localLow);
    int avatarCount = 0;
    if (oscDirExists) try { avatarCount = Directory.GetDirectories(localLow).Length; } catch { }
    return new { success = true, oscDirExists, oscDir = localLow, knownAvatarCount = avatarCount, note = "VRChat writes OSC config to LocalLow/VRChat/VRChat/OSC/<userId>/Avatars/<blueprintId>.json on first avatar use." };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
