---
name: vrc_world_door_sync
old_tool: vrc_world_door_sync
request_type: vrcWorldDoorSync
description: "Phase 13 / vrcWorld / VrcWorldDoorSync"
category: phase-13-vrcworld
tags: [unity, phase13, vrcsdk]
params: []
kind: recipe
sync: sync
requires: [vrcsdk]
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, System.Text, UnityEditor.Animations, UnityEngine.UI
            try
            {
                var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
                string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null;
                if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  }
                var code = @"using UdonSharp;
using UnityEngine;
using VRC.SDKBase;

[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]
public class DoorSync : UdonSharpBehaviour
{
    [UdonSynced] public bool isOpen;
    public Animator anim;
    public override void Interact()
    {
        if (!Networking.IsOwner(gameObject)) Networking.SetOwner(Networking.LocalPlayer, gameObject);
        isOpen = !isOpen;
        RequestSerialization();
        UpdateDoor();
    }
    public override void OnDeserialization() { UpdateDoor(); }
    void UpdateDoor() { if (anim != null) anim.SetBool(""IsOpen"", isOpen); }
}
";
                Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
                File.WriteAllText(outputPath, code, Encoding.UTF8);
                AssetDatabase.Refresh();
                return new { success = true, outputPath };
            }
            catch (Exception e) { return new { success = false, error = e.Message }; }
```
