---
name: ai_prompt_template_gen
old_tool: ai_prompt_template_gen
request_type: aiPromptTemplateGen
description: "AI prompt template gen"
category: ai-bridge
tags: [unity]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection
try { var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>(); string outputPath = argd?.TryGetValue("outputPath", out var op) == true ? op?.ToString() : null; if (string.IsNullOrEmpty(outputPath)) { return new { success = false, error = "outputPath required" };  } var template = "# AI Prompt Template\n\n## Context\n[describe scene/avatar/world state]\n\n## Goal\n[what to generate]\n\n## Constraints\n- VRChat compliant\n- Performance budget: ...\n- Style: ...\n\n## Tools available\n[list MCP tools]\n"; Directory.CreateDirectory(Path.GetDirectoryName(outputPath)); File.WriteAllText(outputPath, template); return new { success = true, outputPath }; } catch (Exception e) { return new { success = false, error = e.Message }; }
```
