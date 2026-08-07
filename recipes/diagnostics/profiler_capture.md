---
name: profiler_capture
old_tool: profiler_capture
request_type: profilerCapture
description: "Save current ProfilerDriver capture data to file. Reflection access ProfilerDriver.SaveProfile."
category: diagnostics
tags: [unity, profiler, capture]
params:
  - {name: outputPath, type: string, required: false, desc: "Default <project>/Temp/mcp-profiler.raw"}
kind: recipe
sync: sync
requires: []
qa: review
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.TestTools.TestRunner.Api
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string outputPath = argd != null && argd.TryGetValue("outputPath", out var op) && op != null ? op.ToString() : Path.Combine(Application.dataPath, "..", "Temp", "mcp-profiler.raw");

    outputPath = Path.GetFullPath(outputPath);
    Directory.CreateDirectory(Path.GetDirectoryName(outputPath));

    // Reflection: UnityEditor.Profiling.Profiler.SetSavePath / Save
    var profilerDriver = AppDomain.CurrentDomain.GetAssemblies()
        .SelectMany(a => { try { return a.GetTypes(); } catch { return new Type[0]; } })
        .FirstOrDefault(t => t.FullName == "UnityEditorInternal.ProfilerDriver");
    if (profilerDriver == null) { return new { success = false, error = "ProfilerDriver type not found" };  }

    var saveMethod = profilerDriver.GetMethod("SaveProfile", BindingFlags.Public | BindingFlags.Static);
    if (saveMethod == null) { return new { success = false, error = "SaveProfile method not found" };  }
    saveMethod.Invoke(null, new object[] { outputPath });

    return new
    {
        success = true,
        outputPath,
        fileExists = File.Exists(outputPath),
        fileSize = File.Exists(outputPath) ? new FileInfo(outputPath).Length : 0
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
