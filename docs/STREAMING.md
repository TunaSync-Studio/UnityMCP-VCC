# Streaming mode (配信モード)

One environment variable puts the MCP server into a screen-share-safe state:
destructive / publishing tools refuse to run, and user-identifying filesystem
paths are masked in everything the server returns.

```
UNITY_MCP_STREAM_MODE=1
UNITY_MCP_STREAM_MASK=CodenameA;MySecretProject     # optional extra terms
```

## What it does

| Surface | Behavior when enabled |
|---|---|
| `execute_editor_command` | **Locked** (`[STREAM_MODE_LOCKED]`) — arbitrary C# = arbitrary side effects |
| `ndmf_bake_run` | **Locked** — writes assets |
| `vrc_upload` | **Locked entirely**, including `dry_run` (publishing surface stays zero) |
| `session_lease {action:"takeover"}` | **Locked** — cannot steal another session's write lease; `acquire/release/status` still work |
| All other tools (`get_editor_state`, `scene_query`, `camera_capture`, `get_logs`, `find_recipe`, `unity_health_check`, `job_status`, `job_cancel`) | Available |
| Tool results, error text, progress messages | `X:\Users\<name>` → `X:\Users\****` (any slash style, JSON-escaped too) + every `UNITY_MCP_STREAM_MASK` term → `****` |

A locked call is refused **before** anything is sent to the Unity plugin.

## How to enable

The variable must be set in the environment of the **MCP server process**.

- **Dedicated stream registration (recommended)** — register a second server
  entry with the env baked in, and use that one while streaming:

  ```bash
  claude mcp add unity-mcp-stream --env UNITY_MCP_STREAM_MODE=1 --env "UNITY_MCP_STREAM_MASK=ProjectA;ProjectB" -- npx -y tunasync-unity-mcp
  ```

- **Shell-inherited** — set the variable before launching the MCP client from
  that shell (PowerShell):

  ```powershell
  $env:UNITY_MCP_STREAM_MODE = "1"
  claude
  ```

Note: changing the env of an already-running server does nothing — the state
is read at server start. Restart the MCP client (or `/mcp` reconnect after
re-registering) to switch modes.

## Mask notes

- The default rule only masks the **user-name path segment**
  (`C:\Users\alice\...` → `C:\Users\****\...`). Bare words are never touched,
  so identifiers like `TOKEN` can never be mangled by the default rule.
- `UNITY_MCP_STREAM_MASK` terms are **literal** replacements
  (`;`-separated). Pick distinctive strings (unreleased project names,
  account names). A term that is a substring of other words will mask those
  too — that is on the operator.
- Masking applies to results, error messages and progress notifications.

## What it does NOT cover (be honest with your OBS scene)

- **The Unity Editor window itself.** If Unity is captured on stream, its
  title bar and Project window show real paths. Don't capture it, or crop.
- **Other MCP clients / direct TCP.** This gate lives in this server process.
  Another process talking to the plugin's TCP port directly is out of scope
  (the per-user token still limits that to your own OS user).
- **The MCP client's own UI** (e.g. a terminal echoing your prompt).
- Piping viewer comments (chat) straight into the AI stays a terrible idea —
  that is a live prompt-injection channel. Streaming mode reduces the blast
  radius; it does not make that safe.

## Emergency stop

Unchanged: drop `UnityMCP.disabled` at the Unity project root
(menu: `Tools > TunaSync Unity MCP > Toggle Disabled Marker`) to kill the
bridge itself, regardless of stream mode.
