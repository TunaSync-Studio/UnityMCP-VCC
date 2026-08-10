# UnityMCP v2 Wire Protocol (PROTOCOL_V = 1)

Ground truth for both sides. `server/src/protocol.ts` and
`package/com.tunasync.unity-mcp/Editor/Core/Protocol.cs` mirror this file;
any change lands in all three or not at all.

## Topology

Unity plugin hosts a `TcpListener` on `127.0.0.1:<port>`. MCP server
processes (N of them, one per MCP client session — Claude, Cursor, any
MCP host) connect as TCP clients.

- Preferred port: `47700 + (fnv1a32(normalizedProjectPath) % 64)`.
  `normalizedProjectPath` = absolute project root, backslashes → `/`,
  trailing slash stripped, lower-cased (Windows). On bind failure probe
  `+1..+8`, then port 0 (OS-assigned). Registry is source of truth.
- Discovery registry: `%LOCALAPPDATA%\UnityMCP\registry\<fnv1a32-hex8>.json`
  written by plugin (atomic: temp file + File.Replace), touched every 60 s,
  deleted on quit. Startup sweeps sibling files whose `pid` is dead.

```json
{
  "schemaVersion": 1,
  "port": 47712,
  "projectPath": "C:/UnityProjects/My Avatar Project",
  "projectName": "My Avatar Project",
  "pid": 12345,
  "unityVersion": "2022.3.22f1",
  "pluginVersion": "2.4.3",
  "protocolV": 1,
  "startedAt": "2026-08-05T12:00:00Z",
  "token": "32-hex same-user auth token (v2.1+)"
}
```

Auth (v2.1+): the plugin generates a per-editor-session token, publishes it
only via this user-ACL'd registry file, and requires clients to echo it as
`hello.client.token`. Missing/mismatched token -> pre-welcome
`res {error:{code:"AUTH_REQUIRED"}}` then close (constant-time compare).
The HTTP health peek stays tokenless (read-only info).

Consent (v2.1+): the listener starts only when the per-user x per-project
consent record (`%LOCALAPPDATA%/UnityMCP/consent/<hash8>.json`,
`{"schemaVersion":1,"enabled":true,"decidedAt":"iso"}`) says enabled, or
env `UNITY_MCP_AUTOCONSENT=1`. Priority: UnityMCP.disabled marker >
consent file > env autoconsent > (batchmode: stay off) > GUI one-time
dialog.

- Kill switch: if `<projectRoot>/UnityMCP.disabled` exists, the plugin does
  not listen and does not write a registry entry.
- Registry invariant: **one project = one entry, written by the MAIN editor
  process only.** Unity side processes (AssetImportWorker, launched with
  `-adb2` / `-name AssetImportWorkerN`) must never run the bootstrap: they
  share the project and its consent record but have no editor loop, and a
  worker's registry write would point clients at a process that can only
  answer BUSY_MODAL.

## Framing

`uint32` big-endian payload length, then that many bytes of UTF-8 JSON.
Max frame 64 MiB. If the first 4 bytes of a new connection are `GET `,
`HEAD`, `POST` or `OPTI`, the plugin switches to one-shot HTTP mode:
respond `HTTP/1.1 200` with a JSON body
`{status:"ok", projectPath, projectName, unityVersion, pluginVersion,
protocolV, compiling, clients, jobs, evalEngine}`, drain the rest of the
request, and close. This is a health snapshot only — there is no HTTP RPC
transport; all real traffic is the framed protocol.

## Envelope

```json
{ "v": 1, "id": "<uuid>", "type": "<frameType>", "payload": { } }
```

- `v` is present only on `hello` / `welcome`.
- JSON property names are camelCase on the wire, both directions.
- `res` and `progress` frames REUSE the `id` of the `req` they answer,
  and `pong` reuses the `id` of its `ping`. All other frames carry a
  fresh id.

## Frame types

| type | dir | payload |
|---|---|---|
| `hello` | C→P | `{v:{min,max}, client:{name,version,pid,sessionId,token}, features:[...]}` — `token` = the registry entry's auth token (required v2.1+; missing/mismatched → pre-welcome `AUTH_REQUIRED` and close) |
| `welcome` | P→C | `{v, plugin:{version}, unity:{version,projectPath,projectName}, editor:{sessionId,pid,domainReloadCount}, eval:{engine}, lease:{holder?}, features:[...]}` |
| `req` | C→P | `{method, params, timeoutMs?, leaseHint?}` |
| `res` | P→C | `{ok:true, result}` or `{ok:false, error:<ErrorObj>}` — exactly one per req id |
| `progress` | P→C | `{pct?, message?, phase?, seq}` — 0..n before the `res` of the same id |
| `event` | P→C | `{kind, data}` — uncorrelated broadcast |
| `cancel` | C→P | `{targetId}` — acked by its own `res {found:bool}`; the target later resolves `CANCELLED` (or completes if it raced) |
| `ping` | C→P | `{}` — answered on the transport thread even during compile/modal |
| `pong` | P→C | `{}` (res-style: echoes ping id) |
| `bye` | P→C | `{reason:"domain_reload"\|"quit"\|"shutdown", resumeHintMs?}` — last frame before close |

Event kinds: `log`, `compile.started`, `compile.finished`,
`reload.imminent`, `playmode.changed`, `job.progress`, `job.terminal`,
`lease.lost`.

Handshake: client must send `hello` within 5 s of connect or be dropped.
Version pick = `min(client.max, plugin.max)`; if below either min →
`res VERSION_UNSUPPORTED` then close.

Backpressure: max 32 in-flight `req` per connection → `PROTOCOL_ERROR`.

## ErrorObj

```json
{
  "code": "EVAL_COMPILE_ERROR",
  "message": "...",
  "retryable": false,
  "detail": {},
  "unityStack": "first line only",
  "consoleErrors": ["errors logged during this request"],
  "diagnostics": [{ "file": "", "line": 1, "col": 1, "severity": "error", "csCode": "CS1002", "text": "" }]
}
```

## Error codes

Plugin-side: `PARSE_ERROR, PROTOCOL_ERROR, VERSION_UNSUPPORTED,
HELLO_TIMEOUT, AUTH_REQUIRED, METHOD_NOT_FOUND, INVALID_PARAMS,
HANDLER_EXCEPTION, TIMEOUT, CANCELLED, DOMAIN_RELOAD*, BUSY_MODAL*,
PLAY_MODE_ACTIVE, LEASE_HELD, LEASE_LOST, JOB_NOT_FOUND,
JOB_NOT_RESUMABLE, EVAL_COMPILE_ERROR, EVAL_RUNTIME_ERROR,
EVAL_ENGINE_UNAVAILABLE` (`*` = retryable:true).

`BUSY_MODAL.detail` = `{pid, projectPath, projectName, batchMode,
lastTickAgoMs, modal?, modalCount}` — `modal {title, buttons[], kind}` names
the native dialog blocking the main thread when one exists (Windows; probed
via user32 off the main thread). `kind` (2.6.1) is `"progress"` (a
`(busy for MM:SS)` counter in the title or an `msctls_progress32` child —
clears itself; do NOT press Cancel, that aborts the operation) or
`"decision"` (a human must dismiss it; retrying alone will not clear it).
When the server's discovery layer detects a stale heartbeat it probes the
blocked editor live before answering (2.6.3, F-5): the merged detail then
also carries `candidates`, `heartbeatAgeMs` and `probedLive: true`. Lease
note (2.6.3, F-6): a write-path auto-refresh keeps the TTL from acquire;
only an explicit `ttl_s` changes it.

`PLAY_MODE_ACTIVE`: `eval.run` refuses while the editor is in play mode
unless `allowPlayMode:true` — play-mode scene edits revert on exit while
asset changes persist.

Server-synthesized: `UNITY_UNREACHABLE, PROJECT_NOT_FOUND,
PROJECT_AMBIGUOUS, RECONNECT_TIMEOUT`.

## Methods (P1/P2 infra surface)

| method | notes |
|---|---|
| `sys.info` | static info (same shape as `welcome` minus v) |
| `sys.status` | volatile snapshot: compiling, playMode, lastTickAgoMs, jobs summary, lease. Served from transport thread (no main-thread hop) |
| `sys.modal` | (2.6.4) `{pid, lastTickAgoMs, modal?, modalCount}` — native-dialog probe (user32), served from the transport thread so it answers while the main thread is blocked. The server's blocked-editor probe uses this (fallback for older plugins: `sys.echo` → watchdog `BUSY_MODAL`) |
| `sys.compile.status` | last compile result: `{compiling, finishedAt?, diagnostics[]}` (persisted across reload) |
| `sys.echo` | `{...}` → same back (tests) |
| `eval.run` | `{code, captureLogs?, run_as_job?, allowPlayMode?}` → `{result, logs[], executionMs, engine}`; refused with `PLAY_MODE_ACTIVE` in play mode unless `allowPlayMode:true` (checked again at job execution time) |
| `lease.acquire` / `lease.release` / `lease.status` / `lease.takeover` | write lease, default TTL 120 s; `{ttlMs?}` per acquire/takeover (clamped 5 s-1 h). Identity = the connection's `hello.client.sessionId`; a foreign `clientId` is INVALID_PARAMS |
| `job.submit` | `{method, params}` → `{jobId}` |
| `job.status` | `{jobId?}` → one JobRecord; omitted → ALL records as a **bare array** (`JobManager.AllRecords()`) |
| `job.wait` | `{jobId, timeoutMs}` — long-poll; progress frames stream on this req id |
| `job.cancel` | `{jobId}` |

Product tools (P3) add `scene.query`, `state.get`, `logs.get`,
`camera.capture`, `asset.importPackage`, `vrc.*` (incl. `vrc.menuTree` /
`vrc.menuAudit`), `ndmf.*` — same envelope rules.

## Domain reload ritual (plugin)

`AssemblyReloadEvents.beforeAssemblyReload`:
1. persist CompileGate diags + JobManager + LeaseManager to SessionState
2. for every in-flight non-job req: `res {ok:false, error:{code:"DOMAIN_RELOAD", retryable:true}}`
3. broadcast `bye {reason:"domain_reload", resumeHintMs:3000}`
4. flush send queues (250 ms budget)
5. close sockets, stop listener

After reload `[InitializeOnLoadMethod]`: restore state, re-bind the SAME
port (kept in SessionState), rewrite registry, resume jobs whose executor
`CanResume`, else mark them failed `JOB_NOT_RESUMABLE`.

## Client state machine (server)

```
idle → discovering → connecting → handshaking → ready
ready --bye(domain_reload)---------→ degraded(grace 180 s) → reconnecting
ready --close/err, registry pid alive→ degraded(grace 30 s) → reconnecting
ready --close, registry pid dead----→ discovering
welcome.editor.sessionId changed----→ invalidate caches → ready
*     --grace exhausted-------------→ failed (fail fast UNITY_UNREACHABLE,
                                       background re-discover every 10 s)
```

Backoff 0.25/0.5/1/2/5 s cap, ±20 % jitter. Heartbeat ping every 10 s,
2 misses → forced reconnect. Calls made while `degraded` wait in a hold
queue until `ready` or their own deadline.

Timeout handling (server): reject `TIMEOUT`, send `cancel`, tombstone the
id for 60 s; a late `res` on a tombstoned id is dropped and logged.
