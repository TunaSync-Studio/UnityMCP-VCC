# TunaSync Unity MCP (v2)

[日本語版 README はこちら / Japanese README](README.ja.md)

![TunaSync Unity MCP — MCP bridge for the Unity Editor](docs/banner.png)

MCP bridge for driving the Unity Editor — built for VRChat avatar/world work.
Ground-up rewrite (2026-08); the legacy 426-tool fork lineage is kept on the
development repository's `legacy-v1` branch (tag `v1-final`) and is not part
of this release tree.

## Quickstart

**1 — Unity side (VCC):** add this repository ([one-click page](https://tunasync-studio.github.io/UnityMCP-VCC/)) and install **TunaSync Unity MCP** into your project:

```
https://tunasync-studio.github.io/UnityMCP-VCC/vpm/index.json
```

**2 — AI side (MCP client, Node 20+):**

```bash
# Claude Code
claude mcp add unity-mcp -- npx -y tunasync-unity-mcp

# OpenAI Codex CLI
codex mcp add unity-mcp -- npx -y tunasync-unity-mcp
```

**3 —** open the Unity project, approve the one-time consent dialog, check `Tools > TunaSync Unity MCP > Creator Console`, then ask your assistant for `unity_health_check`.

Local diagnostics (no MCP session required):

```bash
npx -y tunasync-unity-mcp doctor
```

Details (UPM path, manual MCP config, arming real uploads): `docs/INSTALL.md`.

## Architecture

```
MCP client (Claude, Codex, Cursor, any MCP host - N sessions)
   │  stdio
   ▼
server/  tunasync-unity-mcp (Node 20+, MCP SDK 1.x, single esbuild bundle)
   │  TCP 127.0.0.1:<port>, uint32-BE length-prefixed JSON envelopes
   │  correlation ids, tombstones, reconnect state machine, progress bridging
   ▼
package/com.tunasync.unity-mcp  (Editor-only VPM/UPM package)
   TcpListener host per project: port = 47700 + fnv1a32(projectPath) % 64
   discovery registry: %LOCALAPPDATA%\UnityMCP\registry\<hash8>.json
   MainThreadPump / CompileGate / JobManager / LeaseManager / LogCapture
   eval = Unity-bundled Roslyn (DotNetSdkRoslyn csc.dll via NetCoreRuntime,
   out-of-proc, effective C#10 - C#11 features are preview/CS8652 on Unity's
   toolchain - zero bundled DLLs)
```

- The plugin is the listener → any number of MCP client processes connect
  concurrently; no port fights, no ghost sockets. (Live-verified 2026-08-07:
  3 simultaneous clients on one plugin, two editors driven side by side,
  per-project leases stolen across clients both ways, and one editor frozen
  for 140 s while the other kept answering.)
- Domain reload ritual: in-flight requests get `DOMAIN_RELOAD` (retryable),
  clients get `bye`, listener re-binds the same port after reload; compile
  diagnostics survive via SessionState (`sys.compile.status`).
- Long operations (NDMF bake, VRC upload, builds) run as jobs with streamed
  progress and reload-aware persistence.
- Multi-session writes are serialized by an auto-acquired lease (TTL 120 s,
  takeover supported, disconnected holders are stealable).
- Kill switch: create `UnityMCP.disabled` at the project root (menu:
  Tools > TunaSync Unity MCP > Toggle Disabled Marker).

## Tool surface (18)

`execute_editor_command` (C# eval, `run_as_job` for long snippets),
`get_editor_state` (sectioned + `max_bytes` guard), `scene_query`,
`get_logs`, `camera_capture`, `unity_health_check` (+wake), `session_lease`,
`job_status`, `job_cancel`, `find_recipe`, `ndmf_bake_run`, `vrc_upload`
(avatar/world, `dry_run` = preupload check), `vrc_avatar_audit`.

Plus a **VCC/VPM pair that needs no running editor** (v2.4.x):
`vcc_project` (list the projects VCC knows about / read one project's
locked VPM packages — pure file reads) and `vpm_manage` (add / remove /
resolve / outdated / repo list, and **`create`** — bootstrap a brand-new
project from a VCC template, resolve it and install extras before Unity
ever starts — via the open-source
[vrc-get](https://github.com/vrc-get/vrc-get) CLI; without vrc-get on PATH
the tool answers with install instructions while `vcc_project` keeps
working). Both are locked in streaming mode like the other destructive
tools.

v2.6.0 adds three more: `unity_editor` (launch / quit / status for the
editor process itself — Unity.exe resolved via VCC settings or the Hub,
`-projectPath` spawn only, graceful quit first), `asset_import`
(first-class non-interactive `.unitypackage` import that answers with the
imported asset list) and `vrc_menu` (expression-menu `tree` / `audit`;
the audit flags dead menu items by checking that the transforms a
parameter's layers animate still exist on the avatar).

Everything the legacy 426 tools did is preserved as 400+ **recipes**
(`recipes/`): markdown files whose fenced C# block you can paste into
`execute_editor_command`'s `code` as-is (paste the code block, not the
whole markdown file) — the eval layer auto-wraps bare statement
snippets into its `class EditorCommand { static object Execute() }`
contract, honors each recipe's `// requires-using:` header, and stubs
an empty `args` JObject when a body reads parameters it never binds
(plugin 2.3.7+; `args` is a variable inside your C# source, not a tool
parameter). A parameterized recipe run with the stub reports its own
`"<field> required"` error — replace the stub line inside the source
with `var args = JObject.Parse("{...}");` carrying real values.
`find_recipe` exact-matches old tool names and keyword-searches the
rest; recipes are also exposed as MCP resources
(`recipe://<category>/<name>`).

## Before you install — scope, status, and what this lets an AI do

- **What it is**: an MCP bridge that lets an AI assistant **execute arbitrary
  C# inside your Unity Editor** (that is the point of `execute_editor_command`
  and most recipes). Treat it like handing someone an editor script console.
  Anything an editor script can do — modify or delete assets, run builds — is
  reachable. Only enable it on projects you are willing to have modified, keep
  them in version control, and stay aware that instructions an AI reads from
  untrusted content (web pages, imported files) can influence what it runs.
- **Consent + auth**: nothing listens until you enable the bridge for that
  project (one-time dialog), the socket is loopback-only, and clients must
  present a token that only your OS user can read.
- **Platform**: **Windows only** today. Consent/registry paths use
  `%LOCALAPPDATA%` and the eval engine invokes Unity's bundled Roslyn via
  `Editor/Data/NetCoreRuntime/dotnet.exe`. macOS/Linux are untested.
- **Unity**: verified on **2022.3.22f1** (VRChat's version). Other 2022.3
  patches should be fine; Unity 6 / other majors are unverified — the eval
  toolchain probe fails loudly and `eval.run` returns
  `EVAL_ENGINE_UNAVAILABLE` rather than misbehaving.
- **`vrc_upload`**: `dry_run:true` (validation) and the real avatar publish
  path are both verified live on a real avatar project (2026-08-06); the
  world `dry_run` path is verified live on a published world (2026-08-07).
  Since v2.2.0 a real upload is double-gated: it requires `confirm:true`
  (caller intent) **and** a human-created one-shot arm file (TTL 30 min,
  consumed per attempt) — an AI following its instructions will not publish
  unattended. Arming without a repo checkout: see
  `docs/INSTALL.md` § "Arming a real VRChat upload".
- **Streaming mode**: `UNITY_MCP_STREAM_MODE=1` locks the destructive /
  publishing tools and masks user paths in all output for screen-shared
  sessions — `docs/STREAMING.md`.
- **NDMF bake** writes a baked prefab under `Assets/UnityMCP_Bakes/`; it does
  not touch your source avatar.

## Known issues

- `vrc_avatar_audit`'s `textureMegabytes` counts textures reachable through
  renderers only; textures referenced solely via animation clips or
  build-time generators (e.g. Modular Avatar swaps) are not counted — on one
  measured avatar that hid ~8% of the real total. Treat it as a lower bound
  near the limits.
- Unity 6 is unverified (VRChat currently ships on 2022.3; the eval
  toolchain probe fails loudly rather than misbehaving).
- Recipe front matter under-declares `params:` on some recipes; the eval
  layer stubs an empty `args` so they run and self-report which fields they
  need (see the recipes paragraph above).

## Install

Easiest: `npx -y tunasync-unity-mcp` as the MCP command plus the VCC/UPM
package — see `docs/INSTALL.md`. From source (all paths relative to the
repo root):

```bash
npm --prefix server install && npm --prefix server run build
```

Register in the MCP client (stdio): `node <repo>/server/build/index.js`.

Plugin into a Unity project — one line, no folder copying:

```bash
powershell -ExecutionPolicy Bypass -File tools/install-to-project.ps1 -ProjectPath "C:\path\to\YourProject"
```

(adds a UPM `file:` reference). VRC SDK / NDMF integration activates automatically
via asmdef versionDefines when those packages are present; the package also
works in plain Unity projects.

## Development

- Protocol contract: `docs/PROTOCOL.md` = `server/src/protocol.ts` =
  `package/.../Editor/Core/Protocol.cs` (change all three or none).
- Tests: `cd server && npm test` (vitest, mock plugin, no Unity needed).
- Live gates: `tools/smoke-p1.mjs` (transport), `tools/smoke-p2.mjs`
  (eval/jobs/reload), `tools/smoke-p3-mcp.mjs` (full MCP chain);
  protocol doc: `docs/SMOKE_TEST_PROTOCOL.md`.

## License

v2 code (server/, package/, recipes/, tools/, docs/): MIT, (c) TunaSync
(see `LICENSE`). The development repository's `legacy-v1` branch contains
the upstream fork lineage
([swax/UnityMCP-VRC](https://github.com/swax/UnityMCP-VRC), CC BY-NC 4.0);
v2 ships none of it and this release tree does not include that branch.
