---
name: particle_system_module_set
old_tool: particle_system_module_set
request_type: particleSystemModuleSet
description: "Inspect ParticleSystem main module values (maxParticles / emissionRate / startLifetime / startSpeed)."
category: particle-vfx
tags: [unity, particle]
params:
  - {name: targetName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string targetName = argd != null && argd.TryGetValue("targetName", out var tn) ? tn?.ToString() : null;
    GameObject target = null;
    if (!string.IsNullOrEmpty(targetName)) target = GameObject.Find(targetName);
    if (target == null) target = Selection.activeGameObject;
    if (target == null) { return new { success = false, error = "target required" };  }

    var ps = target.GetComponent<ParticleSystem>();
    if (ps == null) { return new { success = false, error = "no ParticleSystem on target" };  }

    var report = new Dictionary<string, object>
    {
        ["isPlaying"] = ps.isPlaying,
        ["particleCount"] = ps.particleCount,
        ["maxParticles"] = ps.main.maxParticles,
        ["emissionRate"] = ps.emission.rateOverTime.constant,
        ["startLifetime"] = ps.main.startLifetime.constant,
        ["startSpeed"] = ps.main.startSpeed.constant
    };

    return new { success = true, target = target.name, report };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
