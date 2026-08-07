---
name: vrc_mirror_toggle_setup
old_tool: vrc_mirror_toggle_setup
request_type: vrcMirrorToggleSetup
description: "Verify VRCMirrorReflection presence on target. Combine with udonsharp_template_gen (objectsync) for sync toggle UdonBehaviour."
category: vrchat-world
tags: [vrchat, mirror, udon]
params:
  - {name: mirrorName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from VRChatExtHandler.cs) ---
Type FindType(string name) {
            foreach (var a in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type[] types;
                try { types = a.GetTypes(); } catch { continue; }
                var t = types.FirstOrDefault(x => x.Name == name || x.FullName == name);
                if (t != null) return t;
            }
            return null;
        }
GameObject ResolveGo(string name) {
            if (!string.IsNullOrEmpty(name)) { var go = GameObject.Find(name); if (go != null) return go; }
            return Selection.activeGameObject;
        }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string mirrorName = argd != null && argd.TryGetValue("mirrorName", out var mn) ? mn?.ToString() : null;

    GameObject mirror = ResolveGo(mirrorName);
    if (mirror == null) { return new { success = false, error = "mirror not found" };  }

    var mirrorType = FindType("VRCMirrorReflection");
    bool mirrorPresent = mirrorType != null && mirror.GetComponent(mirrorType) != null;

    return new
    {
        success = true,
        mirrorName = mirror.name,
        mirrorComponentPresent = mirrorPresent,
        note = "Use udonsharp_template_gen with templateType=objectsync for toggle script template."
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
