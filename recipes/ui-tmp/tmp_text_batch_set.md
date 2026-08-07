---
name: tmp_text_batch_set
old_tool: tmp_text_batch_set
request_type: tmpTextBatchSet
description: "Count TMP_Text/TextMeshProUGUI in scene + report. Detects TextMeshPro presence."
category: ui-tmp
tags: [unity, textmeshpro, ui]
params: []
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.Reflection, UnityEngine.UI
// --- injected helper shims (from UITMPHandler.cs) ---
Type FindType(string n) { foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { Type[] ts; try { ts = a.GetTypes(); } catch { continue; } var t = ts.FirstOrDefault(x => x.Name == n); if (t != null) return t; } return null; }
// --- end shims ---
try
{
    var tmpType = FindType("TMP_Text") ?? FindType("TextMeshProUGUI");
    if (tmpType == null) { return new { success = false, error = "TextMeshPro not installed" };  }
    int count = UnityEngine.Object.FindObjectsByType(tmpType, FindObjectsSortMode.None).Length;
    return new { success = true, totalTMPText = count, note = "Use component_add_remove + custom Editor script for batch text mutation." };
}
catch (Exception e) { return new { success = false, error = e.Message }; }
```
