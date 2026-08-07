---
name: udonsharp_compile
old_tool: udonsharp_compile
request_type: udonSharpCompile
description: "Force UdonSharpCompilerV1.CompileAllSync (reflection) and AssetDatabase.Refresh. Returns scriptCompilationFailed flag."
category: vrchat-world
tags: [vrchat, udonsharp, compile, vrcsdk]
params: []
kind: recipe
sync: sync
requires: [vrcsdk]
qa: review
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
// --- end shims ---
try
{
    var compileSetType = FindType("UdonSharpCompilerV1");
    bool compileTriggered = false;
    if (compileSetType != null)
    {
        var compileMethod = compileSetType.GetMethod("CompileAllSync", BindingFlags.Public | BindingFlags.Static)
            ?? compileSetType.GetMethod("Compile", BindingFlags.Public | BindingFlags.Static);
        if (compileMethod != null) { try { compileMethod.Invoke(null, null); compileTriggered = true; } catch { } }
    }

    AssetDatabase.Refresh();
    bool compileFailed = EditorUtility.scriptCompilationFailed;
    return new { success = !compileFailed, compileTriggered, scriptCompilationFailed = compileFailed };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
