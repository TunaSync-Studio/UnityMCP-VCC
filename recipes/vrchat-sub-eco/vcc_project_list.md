---
name: vcc_project_list
old_tool: vcc_project_list
request_type: vccProjectList
description: "List Unity project folders under a projects root"
category: vrchat-sub-eco
tags: [unity]
params:
  - {name: projectsRoot, type: string, required: true, desc: "folder that contains your Unity projects"}
kind: recipe
sync: sync
requires: []
qa: review
---
```csharp
// requires-using: System.IO, System.Reflection
try { var p = (string)args["projectsRoot"]; if (string.IsNullOrEmpty(p) || !Directory.Exists(p)) { return new { success = false, error = "projectsRoot missing or not found" };  } var dirs = Directory.GetDirectories(p).Select(d => Path.GetFileName(d)).Take(100).ToList(); return new { success = true, projectCount = dirs.Count, projects = dirs }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
