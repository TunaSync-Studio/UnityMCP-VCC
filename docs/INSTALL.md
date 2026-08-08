# Install — TunaSync Unity MCP

[日本語版はこちら / Japanese version](INSTALL.ja.md)

Two pieces: a Unity **package** (in your project) and a tiny **MCP server**
(registered in your AI client). Each piece is a single command / a single
repository entry, plus a one-time consent click in the editor.

> **Requirements / status**: Windows, Unity **2022.3** (verified on
> 2022.3.22f1), Node.js 20+. This tool lets an AI run arbitrary C# in your
> editor — use it on projects under version control. Real `vrc_upload`
> publishing is double-gated: `confirm:true` **plus** a human-created
> one-shot arm file (`tools/arm-vrc-upload.bat`); `dry_run` and the real
> path are both live-verified. For screen-shared sessions,
> `UNITY_MCP_STREAM_MODE=1` locks destructive/publishing tools and masks
> paths (`docs/STREAMING.md`). See the README's "Before you install" section.

## 1. Unity package

### VCC / ALCOM (VRChat creators — recommended)

Add the repository once:

```
https://tunasync-studio.github.io/UnityMCP-VCC/vpm/index.json
```

VCC: Settings > Packages > Add Repository → paste the URL.
Then in any project: Manage Project → install **TunaSync Unity MCP**.

### Plain Unity (UPM git URL — no VCC needed)

Package Manager → `+` → *Add package from git URL*:

```
https://github.com/TunaSync-Studio/UnityMCP-VCC.git?path=/package/com.tunasync.unity-mcp
```

### First launch

The first time the package loads in a project, Unity shows a one-time
dialog: *"Enable the local MCP bridge (listens on 127.0.0.1 only) for this
project?"* — click **Enable**. That's the only click for that project
(consent is per user × per project). After that the bridge starts silently
with the editor.

- Change your mind later: `Tools > TunaSync Unity MCP > Status Window`
  (enable/disable buttons) or drop a `UnityMCP.disabled` file at the
  project root.
- CI / headless: set the environment variable `UNITY_MCP_AUTOCONSENT=1`.

## 2. MCP server (your AI client)

Requires Node.js 20+.

**Claude Code**

```bash
claude mcp add unity-mcp -- npx -y tunasync-unity-mcp
```

**OpenAI Codex CLI**

```bash
codex mcp add unity-mcp -- npx -y tunasync-unity-mcp
```

The ChatGPT desktop app, Codex CLI and Codex IDE extension share the same
MCP configuration. In the desktop app / IDE, open **Settings > MCP servers >
Add server**, choose **STDIO**, set command `npx` and arguments
`-y`, `tunasync-unity-mcp`, then save and restart. For long NDMF/upload waits,
you may add `tool_timeout_sec = 1300` to the generated
`[mcp_servers.unity-mcp]` table in `~/.codex/config.toml`; timed-out jobs keep
running and can be inspected with `job_status`.

**Claude Desktop** — `claude_desktop_config.json`:

```json
{ "mcpServers": { "unity-mcp": {
    "command": "npx", "args": ["-y", "tunasync-unity-mcp"] } } }
```

**Cursor / other MCP clients**: same command (`npx -y tunasync-unity-mcp`,
stdio transport).

## 3. Use it

1. Open your Unity project (the bridge auto-starts — check
   `Tools > TunaSync Unity MCP > Status Window` if curious).
2. Talk to your AI. `unity_health_check` confirms the link; from there:
   `execute_editor_command` (run C# in the editor), `get_editor_state`,
   `scene_query`, `camera_capture`, `find_recipe` (400+ ready-made
   editor operations), and for VRChat projects `vrc_avatar_audit`,
   `ndmf_bake_run`, `vrc_upload {dry_run:true}`.

Editor start order doesn't matter — the server discovers running editors
automatically (multiple projects at once are fine; pass `project` to pick).

## Updating the server

MCP clients fetch the tool list **once, when the client session connects**.
After updating the server (new `npx` version / new build), restart or
reconnect your MCP client session (`/mcp` reconnect in Claude Code) —
otherwise the client keeps serving the old tool descriptions and may reject
newer parameters with "Input validation error" even though the server
supports them. `unity_health_check` prints `server:{version, build, pid,
startedAt}` so you can always confirm which build actually answered.

## Security model

- The bridge listens on **127.0.0.1 only**; the bridge itself exposes
  nothing to the network and sends no telemetry. (Real `vrc_upload`
  publishing talks to VRChat through the VRC SDK, and `npx` fetches the
  server package from npm — those are the callers' own network actions.)
- Framed connections must present a per-session token that lives in a file
  only your OS user can read — processes running as other OS users on a
  shared machine can't attach. (Anything running as *your* user or as
  admin can read that file; the tokenless HTTP health peek intentionally
  serves read-only status JSON to any local process.)
- The AI can execute C# in your editor **only after** you enabled the
  bridge for that project and configured an MCP client yourself.

## Arming a real VRChat upload (no repo checkout needed)

A REAL `vrc_upload` needs `confirm:true` **plus** a one-shot arm file that
you (the human) create. From a repo checkout, run
`tools/arm-vrc-upload.bat`. Installed via VCC + npx with no checkout?
Create the marker file yourself:

```powershell
New-Item -Force -ItemType File "$env:LOCALAPPDATA\UnityMCP\arm\vrc-upload.arm"
```

It expires after 30 minutes and is consumed by the next real upload
attempt. Never let the AI create it — the whole point is that a human
touched the button.

## 日本語版

フルの日本語手順は [INSTALL.ja.md](INSTALL.ja.md) にあります。クイック版:

1. **Unity側**: VCC → Settings → Packages → Add Repository → 上記URL →
   プロジェクトの Manage Project で「TunaSync Unity MCP」をインストール。
   初回起動時のダイアログで **Enable** を1回押す (それ以降は全自動)。
2. **AI側**: `claude mcp add unity-mcp -- npx -y tunasync-unity-mcp`
   (Node.js 20+ が必要)。
3. Unityでプロジェクトを開いて、AIに話しかけるだけ。接続確認は
   `Tools > TunaSync Unity MCP > Status Window` (緑=接続中・日本語表示切替あり)。
