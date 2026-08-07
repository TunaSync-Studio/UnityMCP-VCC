---
name: vrc_avatar_build_size
old_tool: vrc_avatar_build_size
request_type: vrcAvatarBuildSize
description: "Estimate avatar build size (textures + meshes + audio) and check VRChat 50MB PC / 10MB Quest limits. Rough estimate: textures uncompressed RGBA, mesh ~64B/vertex, audio 16-bit PCM."
category: vrchat-avatar
tags: [vrchat, avatar, size, limit, quest, pc]
params:
  - {name: avatarName, type: string, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: review
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from VRCAvatarHandler.cs) ---
GameObject ResolveAvatar(string name) {
            if (!string.IsNullOrEmpty(name))
            {
                var go = GameObject.Find(name);
                if (go != null) return go;
            }
            return Selection.activeGameObject;
        }
// --- end shims ---
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string avatarName = argd != null && argd.TryGetValue("avatarName", out var an) && an != null ? an.ToString() : null;

    var avatar = ResolveAvatar(avatarName);
    if (avatar == null) { return new { success = false, error = "avatar not found" };  }

    long textureBytes = 0, meshBytes = 0, audioBytes = 0;
    int textureCount = 0, meshCount = 0, audioCount = 0, materialCount = 0;
    var renderers = avatar.GetComponentsInChildren<Renderer>(true);
    var seenTex = new HashSet<Texture>();
    var seenMesh = new HashSet<Mesh>();
    var seenMat = new HashSet<Material>();

    foreach (var r in renderers)
    {
        foreach (var m in r.sharedMaterials)
        {
            if (m == null) continue;
            if (seenMat.Add(m)) materialCount++;
            var shader = m.shader;
            if (shader == null) continue;
            for (int i = 0; i < shader.GetPropertyCount(); i++)
            {
                if (shader.GetPropertyType(i) == UnityEngine.Rendering.ShaderPropertyType.Texture)
                {
                    var name = shader.GetPropertyName(i);
                    var tex = m.GetTexture(name);
                    if (tex != null && seenTex.Add(tex))
                    {
                        textureCount++;
                        if (tex is Texture2D t2)
                            textureBytes += (long)t2.width * t2.height * 4;
                    }
                }
            }
        }
        if (r is SkinnedMeshRenderer smr && smr.sharedMesh != null && seenMesh.Add(smr.sharedMesh))
        {
            meshCount++;
            meshBytes += smr.sharedMesh.vertexCount * 64L;
        }
        else if (r is MeshRenderer && r.GetComponent<MeshFilter>()?.sharedMesh != null)
        {
            var mf = r.GetComponent<MeshFilter>().sharedMesh;
            if (seenMesh.Add(mf)) { meshCount++; meshBytes += mf.vertexCount * 64L; }
        }
    }
    var audioSources = avatar.GetComponentsInChildren<AudioSource>(true);
    foreach (var a in audioSources)
    {
        if (a.clip != null) { audioCount++; audioBytes += (long)a.clip.samples * a.clip.channels * 2; }
    }

    long totalBytes = textureBytes + meshBytes + audioBytes;
    long pcLimit = 50L * 1024L * 1024L;
    long questLimit = 10L * 1024L * 1024L;

    return new
    {
        success = true,
        avatar = avatar.name,
        textureCount,
        meshCount,
        audioCount,
        materialCount,
        textureBytes,
        meshBytes,
        audioBytes,
        totalBytesEstimate = totalBytes,
        pcLimitBytes = pcLimit,
        questLimitBytes = questLimit,
        pcExcess = totalBytes - pcLimit,
        questExcess = totalBytes - questLimit,
        pcOk = totalBytes <= pcLimit,
        questOk = totalBytes <= questLimit,
        note = "Rough estimate: textures uncompressed RGBA, mesh ~64B/vert, audio 16-bit PCM"
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
