---
name: unity_test_run
old_tool: unity_test_run
request_type: unityTestRun
description: "Run Unity Test Runner (EditMode / PlayMode). Tests execute asynchronously; check Test Runner window or console_log_filter for results."
category: testing
tags: [unity, test, test-runner]
params:
  - {name: mode, type: string, required: false, desc: "enum: edit|play"}
kind: recipe
sync: sync
requires: []
qa: clean
---
```csharp
// requires-using: System.IO, System.Reflection, UnityEditor.TestTools.TestRunner.Api
try
{
    var argd = args.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    string mode = argd != null && argd.TryGetValue("mode", out var m) && m != null ? m.ToString() : "edit";

    var api = ScriptableObject.CreateInstance<TestRunnerApi>();
    var filter = new Filter()
    {
        testMode = mode == "play" ? TestMode.PlayMode : TestMode.EditMode
    };
    api.Execute(new ExecutionSettings(filter));

    return new
    {
        success = true,
        armed = true,
        mode,
        note = "Tests executing async. Check Test Runner window or console_log_filter for results."
    };
}
catch (Exception e)
{
    return new { success = false, error = e.Message };
}
```
