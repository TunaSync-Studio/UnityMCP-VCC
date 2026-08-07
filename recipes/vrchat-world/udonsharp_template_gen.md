---
name: udonsharp_template_gen
old_tool: udonsharp_template_gen
request_type: udonSharpTemplateGen
description: "Generate UdonSharp .cs template for VRC world. templateType: objectsync (Networking.SetOwner pickup) / persistence (UdonSynced + FieldChangeCallback) / broadcast (SendCustomNetworkEvent All)."
category: vrchat-world
tags: [vrchat, udonsharp, template, codegen, vrcsdk]
params:
  - {name: outputPath, type: string, required: true, desc: ""}
  - {name: templateType, type: string, required: false, desc: "enum: objectsync|persistence|broadcast"}
  - {name: className, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: [vrcsdk]
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, System.Text
            try
            {
                var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
                string outputPath = argd != null && argd.TryGetValue("outputPath", out var op) ? op?.ToString() : null;
                string templateType = argd != null && argd.TryGetValue("templateType", out var tt) ? tt?.ToString() : "objectsync";
                string className = argd != null && argd.TryGetValue("className", out var cn) ? cn?.ToString() : "MyUdonScript";
                if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  }

                string code;
                if (templateType == "persistence")
                {
                    code = $@"using UdonSharp;
using UnityEngine;
using VRC.SDKBase;
using VRC.Udon;

[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]
public class {className} : UdonSharpBehaviour
{{
    [UdonSynced, FieldChangeCallback(nameof(SyncedScore))] private int _syncedScore;
    public int SyncedScore
    {{
        get => _syncedScore;
        set {{ _syncedScore = value; OnScoreChanged(); }}
    }}

    public override void OnDeserialization() {{ }}
    public void OnScoreChanged() {{ /* react to score change */ }}

    public void IncreaseScore()
    {{
        if (!Networking.IsOwner(gameObject)) Networking.SetOwner(Networking.LocalPlayer, gameObject);
        SyncedScore++;
        RequestSerialization();
    }}
}}
";
                }
                else if (templateType == "broadcast")
                {
                    code = $@"using UdonSharp;
using UnityEngine;
using VRC.SDKBase;
using VRC.Udon;

public class {className} : UdonSharpBehaviour
{{
    public void GlobalEvent()
    {{
        SendCustomNetworkEvent(VRC.Udon.Common.Interfaces.NetworkEventTarget.All, nameof(OnGlobalEvent));
    }}
    public void OnGlobalEvent() {{ Debug.Log(""[{className}] global event""); }}
}}
";
                }
                else // objectsync default
                {
                    code = $@"using UdonSharp;
using UnityEngine;
using VRC.SDKBase;
using VRC.Udon;

public class {className} : UdonSharpBehaviour
{{
    public override void Interact() {{ TakeOwnership(); }}
    public void TakeOwnership() {{ if (!Networking.IsOwner(gameObject)) Networking.SetOwner(Networking.LocalPlayer, gameObject); }}
    public override void OnPickup() {{ TakeOwnership(); }}
}}
";
                }

                Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
                File.WriteAllText(outputPath, code, Encoding.UTF8);
                AssetDatabase.Refresh();

                return new { success = true, outputPath, templateType, className };
            }
            catch (Exception e) { return new { success = false, error = e.Message }; }
```
