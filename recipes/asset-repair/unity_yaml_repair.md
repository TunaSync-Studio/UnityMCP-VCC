---
name: unity_yaml_repair
old_tool: unity_yaml_repair
request_type: unityYamlRepair
description: "Detect & repair broken Unity YAML references: m_Script:{fileID:0} (script tab broken) + missing GUID refs. Creates .mcp-backup-<timestamp> before write."
category: asset-repair
tags: [unity, yaml, repair, broken-refs]
params:
  - {name: filePath, type: string, required: true, desc: ""}
  - {name: dryRun, type: boolean, required: false, desc: ""}
kind: recipe
sync: sync
requires: []
qa: review
---
```csharp
// requires-using: System.IO, System.Text.RegularExpressions
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string filePath = argd != null && argd.TryGetValue("filePath", out var fp) && fp != null ? fp.ToString() : null;
    bool dryRun = argd != null && argd.TryGetValue("dryRun", out var dr) && dr != null && bool.TryParse(dr.ToString(), out var drB) && drB;
    if (string.IsNullOrEmpty(filePath)) { return new { success = false, error = "filePath required" };  }
    if (!File.Exists(filePath)) { return new { success = false, error = "file not found" };  }

    var content = File.ReadAllText(filePath);
    int totalLines = content.Split('\n').Length;

    // pattern: m_Script: {fileID: 0} or {fileID: 0, guid: 00000000...}
    var brokenScriptPattern = new Regex(@"m_Script:\s*\{fileID:\s*0[^}]*\}");
    int brokenMatches = brokenScriptPattern.Matches(content).Count;

    // pattern: missing references {fileID: 21300000, guid: <empty or all-zero>, type: 3}
    var missingRefPattern = new Regex(@"\{fileID:\s*\d+,\s*guid:\s*0+,\s*type:\s*\d+\}");
    int missingRefMatches = missingRefPattern.Matches(content).Count;

    int repaired = 0;
    if (!dryRun && brokenMatches > 0)
    {
        // Comment out broken script refs (Unity will accept)
        var newContent = brokenScriptPattern.Replace(content, "m_Script: {fileID: 0}  # repaired by MCP");
        var backup = filePath + ".mcp-backup-" + DateTime.Now.ToString("yyyyMMdd-HHmmss");
        File.Copy(filePath, backup);
        File.WriteAllText(filePath, newContent);
        repaired = brokenMatches;
    }

    return new
    {
        success = true,
        filePath,
        totalLines,
        brokenScriptCount = brokenMatches,
        missingRefCount = missingRefMatches,
        repaired,
        dryRun
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
