# tunasync-unity-mcp

MCP (Model Context Protocol) server that drives the Unity Editor: run C# in
the editor, query scenes and editor state, capture screenshots, run NDMF
avatar bakes and VRChat uploads as resumable background jobs, read console
logs, and search a built-in library of Unity/VRChat recipes.

It pairs with the UnityMCP editor plugin (`com.tunasync.unity-mcp`), which
hosts a TCP listener per Unity project. This server discovers running editors
via a registry in `%LOCALAPPDATA%\UnityMCP\registry` and connects out to them.
It survives domain reloads and editor restarts transparently.

## Status and scope

- **Windows only** today (registry/consent paths and the Roslyn eval engine
  are Windows-specific). macOS/Linux untested.
- **Unity 2022.3** verified (2022.3.22f1). Other majors unverified; the eval
  engine probes the editor's bundled toolchain and reports
  `EVAL_ENGINE_UNAVAILABLE` instead of guessing.
- **This grants an AI arbitrary C# execution inside your editor.** The plugin
  will not listen until you enable it for that project, the socket is
  loopback-only, and clients must present a per-session token readable only by
  your OS user. Still: use it on projects under version control.
- **`vrc_upload` real publishing is double-gated**: it needs `confirm:true`
  **and** a human-created one-shot arm file
  (`%LOCALAPPDATA%\UnityMCP\arm\vrc-upload.arm`, TTL 30 min — see
  `tools/arm-vrc-upload.bat` in the repo). Both `dry_run` and the real
  publish path are live-verified (2026-08-06).
- **Streaming mode**: `UNITY_MCP_STREAM_MODE=1` locks
  `execute_editor_command` / `ndmf_bake_run` / `vrc_upload` / `vpm_manage` /
  `unity_editor` / `asset_import` / `vcc_project` /
  `session_lease{takeover}` and masks `X:\Users\<name>` path segments (plus
  `UNITY_MCP_STREAM_MASK` terms) in all output — for screen-shared sessions.

## Setup

Requires Node.js >= 20 and a Unity project with the UnityMCP plugin installed.

### Claude Code

```
claude mcp add unity -- npx -y tunasync-unity-mcp
```

Or with a pinned project:

```
claude mcp add unity --env UNITY_MCP_PROJECT="MyProject" -- npx -y tunasync-unity-mcp
```

### OpenAI Codex

```
codex mcp add unity -- npx -y tunasync-unity-mcp
```

Or with a pinned project:

```
codex mcp add unity --env UNITY_MCP_PROJECT="MyProject" -- npx -y tunasync-unity-mcp
```

The desktop app, CLI and IDE extension share this MCP configuration. For
long NDMF/upload waits, set `tool_timeout_sec = 1300` in the server's
`[mcp_servers.unity]` table in `~/.codex/config.toml`.

### Claude Desktop

```json
{
  "mcpServers": {
    "unity": {
      "command": "npx",
      "args": ["-y", "tunasync-unity-mcp"],
      "env": {
        "UNITY_MCP_PROJECT": "MyProject"
      }
    }
  }
}
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `UNITY_MCP_PROJECT` | (auto) | Project path or name substring used when several Unity editors run at once |
| `UNITY_MCP_RECIPES_DIR` | bundled `recipes/` | Override the recipe library location |
| `UNITY_MCP_REGISTRY_DIR` | `%LOCALAPPDATA%\UnityMCP\registry` | Override the plugin discovery registry |
| `UNITY_MCP_DEFAULT_TIMEOUT_MS` | `60000` | Default per-call timeout |
| `UNITY_MCP_STREAM_MODE` | off | `1` = streaming mode: lock destructive/publishing tools, mask user paths in output |
| `UNITY_MCP_STREAM_MASK` | (none) | Extra literal terms to mask, `;`-separated |
| `UNITY_MCP_ARM_FILE` | `%LOCALAPPDATA%\UnityMCP\arm\vrc-upload.arm` | Human arm file required (with `confirm:true`) for a real `vrc_upload` |
| `UNITY_MCP_ARM_TTL_MIN` | `30` | Arm file freshness window in minutes (one-shot; consumed per attempt) |

## Tools

`unity_health_check`, `execute_editor_command`, `get_editor_state`,
`scene_query`, `camera_capture`, `get_logs`, `find_recipe`, `ndmf_bake_run`,
`vrc_upload`, `vrc_avatar_audit`, `vrc_menu` (menu tree + dead-item audit),
`asset_import` (non-interactive .unitypackage), `session_lease`,
`job_status`, `job_cancel`, plus three that need no running editor:
`vcc_project` (read the VCC project list / one project's locked VPM
packages), `vpm_manage` (vrc-get wrapper: add / remove / resolve / upgrade /
outdated / repos, and `create` — bootstrap a new project from a VCC template
before Unity ever starts) and `unity_editor` (launch / quit / status for the
editor process itself).

Recipes are also exposed as MCP resources under `recipe://<category>/<name>`.

## License

MIT
