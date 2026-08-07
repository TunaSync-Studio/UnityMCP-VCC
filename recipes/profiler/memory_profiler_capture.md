---
name: memory_profiler_capture
old_tool: memory_profiler_capture
request_type: memoryProfilerCapture
description: "Report Unity Memory Profiler installation + Profiler.GetTotalAllocatedMemory + GetTotalReservedMemory."
category: profiler
tags: [unity, memory, profiler]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
// --- injected helper shims (from ProfilerInputHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n || x.FullName == n); if (t != null) return t; } return null; }
// --- end shims ---
try
{
    var memProfilerType = FindType("Unity.MemoryProfiler.MemoryProfilerWindow") ?? FindType("MemoryProfilerWindow");
    bool installed = memProfilerType != null;
    long totalAllocated = UnityEngine.Profiling.Profiler.GetTotalAllocatedMemoryLong();
    long totalReserved = UnityEngine.Profiling.Profiler.GetTotalReservedMemoryLong();
    return new { success = true, memoryProfilerInstalled = installed, totalAllocatedBytes = totalAllocated, totalReservedBytes = totalReserved };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
