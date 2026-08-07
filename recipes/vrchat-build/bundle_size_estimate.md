---
name: bundle_size_estimate
old_tool: bundle_size_estimate
request_type: bundleSizeEstimate
description: "Scene-wide bundle size estimate (textures + meshes + audio). Returns vs World 100MB PC / 50MB Quest limits."
category: vrchat-build
tags: [vrchat, size, world]
params:
  - {name: mode, type: string, required: false, desc: "enum: scene"}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.Reflection
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string mode = argd != null && argd.TryGetValue("mode", out var m) ? m?.ToString() : "scene";

    long total = 0;
    int textureCount = 0, meshCount = 0, audioCount = 0;
    long textureBytes = 0, meshBytes = 0, audioBytes = 0;

    if (mode == "scene")
    {
        var rends = UnityEngine.Object.FindObjectsByType<Renderer>(FindObjectsSortMode.None);
        var seenTex = new HashSet<Texture>();
        var seenMesh = new HashSet<Mesh>();
        foreach (var r in rends)
        {
            foreach (var mat in r.sharedMaterials)
            {
                if (mat == null) continue;
                var sh = mat.shader; if (sh == null) continue;
                for (int i = 0; i < sh.GetPropertyCount(); i++)
                {
                    if (sh.GetPropertyType(i) == UnityEngine.Rendering.ShaderPropertyType.Texture)
                    {
                        var tex = mat.GetTexture(sh.GetPropertyName(i));
                        if (tex != null && seenTex.Add(tex))
                        {
                            textureCount++;
                            if (tex is Texture2D t2) textureBytes += (long)t2.width * t2.height * 4;
                        }
                    }
                }
            }
            if (r is SkinnedMeshRenderer smr && smr.sharedMesh != null && seenMesh.Add(smr.sharedMesh)) { meshCount++; meshBytes += smr.sharedMesh.vertexCount * 64L; }
            else if (r is MeshRenderer && r.GetComponent<MeshFilter>()?.sharedMesh != null) { var mf = r.GetComponent<MeshFilter>().sharedMesh; if (seenMesh.Add(mf)) { meshCount++; meshBytes += mf.vertexCount * 64L; } }
        }
        foreach (var aud in UnityEngine.Object.FindObjectsByType<AudioSource>(FindObjectsSortMode.None))
        {
            if (aud.clip != null) { audioCount++; audioBytes += (long)aud.clip.samples * aud.clip.channels * 2; }
        }
        total = textureBytes + meshBytes + audioBytes;
    }

    long pcLimit = 100L * 1024L * 1024L; // World ~100MB
    long questLimit = 50L * 1024L * 1024L; // World Quest ~50MB

    return new
    {
        success = true,
        mode,
        textureCount,
        meshCount,
        audioCount,
        textureBytes,
        meshBytes,
        audioBytes,
        totalBytes = total,
        worldPcLimit = pcLimit,
        worldQuestLimit = questLimit,
        pcOk = total <= pcLimit,
        questOk = total <= questLimit
    };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
