---
name: claude_a_p_i_tool_chain
old_tool: claude_a_p_i_tool_chain
request_type: claudeAPIToolChain
description: "Claude API tool chain pattern"
category: ai-bridge
tags: [unity, doc-stub]
params: []
kind: doc
sync: sync
requires: []
qa: clean
---
```text
Claude API tool chain: probe → audit → repair → upload pattern. When driving this from a sub-agent, restart the sub-agent session between phases so stale editor state never leaks across steps.
```
