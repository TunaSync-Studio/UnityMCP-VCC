# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versions tag the
repo as `v2.x.y`; server-only releases explicitly note the unchanged Unity
package version.

## [Unreleased]

## [2.6.5] - 2026-08-10

Unity package only; the npm server is unchanged (stays 2.6.4).

### Fixed
- **The avatar audits accept a baked prefab, so their own advice works**
  (F-13): `textureMegabytesAnimOnly` is 0 on an unbaked avatar and the note
  says to "run ndmf_bake_run and audit the baked result" — but the bake
  answers with a prefab ASSET path while `vrc_avatar_audit` / `vrc_menu`
  resolved scene objects only, so following the note produced
  `INVALID_PARAMS`. Both tools now take an asset path as well: the prefab
  is instantiated as a throwaway copy (`HideFlags.DontSave`), audited, and
  destroyed before the call returns, with `avatarAssetPath` echoed in the
  result so it is clear what was measured. Scene resolution is tried first
  and is unchanged. The note now says to pass `outputPrefabPath` straight
  back.
- **`vrc_menu` audits puppet controls instead of writing them off** (F-11):
  Radial/TwoAxis/FourAxis puppets keep their parameters in
  `subParameters` and leave `parameter` empty — the normal, working
  shape. The audit read `parameter` only, so every puppet hit the
  "no-parameter" early-out: working ones were reported as if broken, and
  a puppet whose parameter was undeclared, unused by any animator, or
  animating deleted transforms was never judged on any axis and could
  not reach `deadMenuItems`. Controls are now judged on every parameter
  they drive (worst axis wins), the judged names ship as `parameters`,
  and `no-parameter` means genuinely nothing is wired. `vrc_menu tree`
  gained `subParameters` for the same reason — a puppet used to dump as
  `parameter: ""` with its wiring invisible. On the first real avatar it
  ran against, the newly-audited puppet turned up two missing transforms.
  Name collection lives outside the Avatars-SDK compile gate so it is
  unit-tested with plain fakes (6 EditMode tests, no SDK required).

## [2.6.4] - 2026-08-10

Unity plugin + npm server release: the 2.6.3 full-test pass proved the
F-5 modal probe never fired in the field and hardened the release flow.

### Fixed
- **The blocked-editor modal probe actually fires now** (F-8): 2.6.3's
  probe asked `sys.status`, which the plugin answers on its transport
  thread *before* the busy-watchdog — the probe always saw `ok` and the
  enrichment silently no-opped (the regression suite had mocked the
  probe, verifying the graft but never the acquisition). The plugin now
  exposes `sys.modal` — a transport-thread fast path returning the
  native-dialog probe directly (watchdog-independent) — and the server
  probes it first, falling back to `sys.echo` (main-thread queued, so
  the >3 s watchdog answers `BUSY_MODAL` with the modal) on pre-2.6.4
  plugins. A live probe that finds NO dialog now says so too — "long
  import/compile, not an unclicked dialog" is the other half of the
  ambiguity this feature exists to remove. Regression tests now run the
  real probe over real TCP against the scriptable mock plugin.
- **`unity_health_check` names the blocking dialog** (F-9): health wraps
  errors in a normal result and so bypassed the error-path enrichment —
  the tool the docs tell people to start with was the one place the
  dialog name never appeared. All three paths are covered now: the
  all-editors-unresponsive answer probes the blocked editor, the
  resolve-error answer runs the same enrichment as other tools, and a
  frozen-but-connected editor is asked via `sys.modal` directly.
- **`build-public-repo.mjs` can no longer gut the public tree** (F-10):
  the wipe step included `server/node_modules` (thousands of files,
  created by the checklist's own `npm ci` verification), which made
  `rmSync` fail half-way on network filesystems with tracked files
  already deleted. node_modules is now kept across regenerations, and a
  wipe failure prints the recovery command
  (`git -C dist/public-repo checkout -- .`) instead of leaving a
  half-destroyed tree unexplained.

## [2.6.3] - 2026-08-10

Unity plugin + npm server release: three findings from the second field
pass (`BUSY_MODAL` short-circuit hunt on a live avatar project).

### Fixed
- **OS process scan can no longer grab the wrong Unity.exe** (F-7): the
  quit/cleanup fallback introduced in 2.6.1 matched command lines by
  substring, so AssetImportWorkers (same exe, same `-projectPath`,
  spawned exactly when imports are churning) and path-prefix sibling
  projects (`milfy_neo01` vs `milfy_neo01_jacket`) could be picked —
  quitting a worker reported fake success; force-killing one mid-import
  is the Library-corruption case the tool itself warns about. The scan
  now extracts the `-projectPath` value and requires an exact normalized
  match, excludes `-batchMode`/`AssetImportWorker` processes, and
  returns nothing when more than one candidate survives.
- **Long blocks no longer lose the modal name** (F-5): once the registry
  heartbeat aged past the stale threshold, the server answered from its
  own short-circuit without asking the plugin — so `BUSY_MODAL` carried
  a named dialog for short stalls but only "blocked main thread -
  modal dialog, long import, sleep" for long ones, the exact case the
  feature exists for. The server now probes the blocked editor live
  (hello and the watchdog answer run on the plugin's transport thread,
  main thread not required) and grafts `detail.modal` onto the
  unresponsive answer, keeping the candidates/heartbeat diagnostics.
- **Write operations no longer shrink a custom lease TTL** (F-6): the
  write path auto-refreshes the lease with no explicit ttl, and that
  refresh overwrote a `ttl_s: 900` acquire back to the 120 s default —
  opening a takeover window mid-job. An implicit same-holder refresh
  now keeps the acquired TTL; an explicit `ttl_s` still applies.
- `vpm_manage` with `clean_library:false` now answers
  `libraryClean: {skipped, reason}` instead of silently omitting the
  key, so a skipped clean is distinguishable from a forgotten one.

## [2.6.2] - 2026-08-10

Server-only npm republish. The `tunasync-unity-mcp@2.6.1` npm artifact
was published from a tree whose `build/` and `recipes/` outputs had not
been regenerated, so the tarball shipped 4 files instead of ~418 and the
`tunasync-unity-mcp` bin did not exist after install. 2.6.1 on npm is
deprecated; **the Unity package / VPM 2.6.1 zip is unaffected and stays
current** (no plugin changes in this release).

### Fixed
- npm tarball actually contains `build/index.js` and the recipe set.
- `prepack` now rebuilds the bundle and runs the metadata smoke, so a
  publish from an unbuilt tree fails loudly instead of shipping an
  empty package.

## [2.6.1] - 2026-08-09

Unity plugin + npm server release: the four findings from the 2026-08-09
field verification of 2.6.0 (three real avatar projects, every tool live).

### Fixed
- **Editor-open detection no longer depends on the MCP registry** (F-1):
  `unity_editor` and the `clean_library` guard now check Unity's own
  `Temp/UnityLockfile` first, then the discovery registry for the pid.
  The registry-only check missed Safe-Mode/compile-failure editors — the
  plugin is not loaded exactly when quit and cleanup matter most — and
  let `clean_library` delete `Library/Bee` under a live editor (the one
  real-harm finding). `quit` now locates unregistered editors by OS
  process scan (command-line match on the project path) instead of
  no-opping; `launch` refuses on a present lockfile and says when it may
  be a stale crash leftover; skip/refuse messages name the evidence.
  `launch`'s ready-wait still requires a *registry* entry, so the
  lockfile appearing seconds after spawn cannot fake readiness.
- **`BUSY_MODAL` distinguishes progress dialogs from decision dialogs**
  (F-2): `detail.modal.kind` is `"progress"` (busy-counter title like
  `(busy for 01:14)` or an `msctls_progress32` child) or `"decision"`.
  Progress dialogs get "clears itself — do NOT press Cancel"; the old
  blanket "a human must dismiss this" invited an agent to cancel a live
  import/export.
- **`textureMegabytesAnimOnly` note states the unbaked-is-always-0
  rule** (F-3): Modular Avatar material swaps become animation curves
  only during the NDMF build, so auditing the scene avatar shows 0;
  the note now says to bake (`ndmf_bake_run`) and audit the result —
  a field avatar hiding +16% behind material swaps would otherwise
  read as "no hidden textures".
- **Plugin honors `UNITY_MCP_REGISTRY_DIR`** (F-4): the C# registry dir
  now takes the same env override as the server, unblocking discovery
  on POSIX where the two sides disagreed on the default path.

## [2.6.0] - 2026-08-09

Unity plugin + npm server release: the MCP-completeness roadmap from the
2026-08-09 field session (avatar maintenance work that had to leave the
MCP repeatedly). Supersedes 2.5.0 on npm — 2.5.0 shipped to GitHub only
and everything in it is included here.

### Added
- **`BUSY_MODAL` names the blocking dialog** (P0-1): `detail.modal
  {title, buttons[]}` plus a message line naming the native dialog
  (probed via user32 off the main thread), so "long import" and "modal
  nobody clicks" are finally distinguishable — that ambiguity cost the
  field session three hours. Detection only: pressing buttons stays a
  human decision.
- **Play-mode guard for C# execution** (P0-2): `eval.run` (inline and
  job) refuses with `PLAY_MODE_ACTIVE` while the editor is playing,
  because scene edits then revert on exit while asset changes persist.
  `execute_editor_command allow_play_mode:true` is the explicit opt-in.
- **`vpm_manage action:"upgrade"`** (P1-1): one package or everything;
  conflict warnings that `-y` auto-accepts are surfaced verbatim.
- **Derived-cache clean after package writes** (P1-2): add / remove /
  resolve / upgrade delete `Library/Bee` + `Library/ScriptAssemblies`
  (`clean_library`, default true; refuses while that project's editor is
  open; `PackageCache`/`ArtifactDB` are never touched). Stale caches sent
  the next editor start into Safe Mode three times in the field session.
- **`unity_editor` tool** (P1-3): launch / quit / status for the editor
  process (editorless layer). Unity.exe resolves via editor_path > VCC
  settings > Unity Hub; `-projectPath` spawn only (never `-openfile`,
  which hangs Unity); refuses a second instance on an open project; quit
  is graceful-first with an explicit `force` escalation.
- **`asset_import` tool** (P2-1): first-class non-interactive
  `.unitypackage` import answering with the imported asset list.
- **`vrc_menu` tool** (P2-3): expression-menu `tree` and `audit`. The
  audit's third axis — do the transforms a parameter's layers animate
  still exist? — is what catches dead menu items; the first two axes
  (declared, consumed) looked fine for all eight found in the field.
  Source-controller judgement; AAO/SDK internal dummies excluded.
- **`vrc_avatar_audit` texture supplement** (P2-2):
  `textureMegabytesAnimOnly` adds textures reachable only through
  animation object-reference curves (the Modular Avatar material-swap
  case) that `stats.textureMegabytes` cannot see (~8% on a measured
  avatar).

Tool surface: 15 → 18.

## [2.5.0] - 2026-08-09

Unity plugin and npm server release focused on operator UX and local
diagnostics. The wire protocol remains v1.

### Added
- **Creator Console** (EN/JA): truthful transport state, connected MCP server
  version/PID/session, write-lease owner, latest jobs with progress/cancel,
  compile/reload state and sanitized compiler diagnostics.
- Client-aware setup tabs for Codex, Claude Code, Cursor and generic JSON.
- Human-only VRC upload arm/disarm controls. No MCP method can create the
  one-shot arm file; the UI requires a deliberate local confirmation.
- Read-only `npx -y tunasync-unity-mcp doctor` (`--json`, `--verbose`) for
  Node, recipe bundle, registry/HTTP health, VCC projects and vrc-get checks.
- Searchable bilingual GitHub Pages UI for all 412 public recipes, with
  responsive and keyboard-accessible layouts.
- Unity EditMode coverage for generated client setup and the fixed arm TTL.

### Changed
- `UnityMCP.disabled` is now an immediate kill switch: it disconnects clients,
  stops the listener and registry, releases the write lease and signals active
  jobs. Removing it restarts the transport without a domain reload or duplicate
  Editor hooks.
- The banner and setup surfaces now name Codex explicitly.

## [2.4.5] - 2026-08-09

Server-only release (npm). The Unity plugin stays at 2.4.3 because the wire
protocol is unchanged; Codex clients using `npx -y tunasync-unity-mcp` pick up
the new server automatically.

### Added
- MCP server-wide operating/safety instructions, including project selection,
  write-lease discipline, prompt-injection resistance and the human-only arm
  rule for real VRChat uploads.
- Explicit `readOnlyHint`, `destructiveHint` and `openWorldHint` metadata for
  all 15 tools, with mixed-action tools classified by their strongest side
  effect, plus an stdio distribution-bundle smoke test for the metadata.
- OpenAI Codex CLI, desktop and IDE setup instructions, including the optional
  long-job timeout setting.

## [2.4.4] - 2026-08-08

Server-only release (npm). The Unity plugin stays at 2.4.3 — nothing
plugin-side changed, and `npx -y tunasync-unity-mcp` picks this up
automatically. Findings come from a clean-room post-publish audit
(fresh VCC project, published artifacts only).

### Fixed
- **`vrc_physbone_audit` recipe**: an unset `rootTransform` (the normal
  state — "use my own transform") crashed the recipe with
  `UnassignedReferenceException`. Cause: Unity fake-null — `as Transform`
  on a destroyed/unassigned serialized field returns a non-null wrapper,
  so `?? pb.transform` never fired. The recipe now falls back through
  Unity's overloaded `== null`. (The built-in `vrc_avatar_audit` tool was
  never affected.)
- **`LEASE_HELD` now says what to do**: the server appends a hint that a
  live holder keeps renewing the lease (waiting will not free it) and
  points at `session_lease {action:"takeover"}`.
- **`METHOD_NOT_FOUND` for `ndmf.bake` now says why**: the server appends
  a hint that NDMF is missing from that project and installing
  nadena.dev.ndmf (ships with Modular Avatar) registers the executor.

## [2.4.3] - 2026-08-08

### Fixed
- **VPM zip separators**: entries were stored with `\` (PowerShell
  Compress-Archive default), violating ZIP spec 4.4.17.1. Windows VCC and
  vrc-get/ALCOM (which normalizes separators on extract) were unaffected;
  strict extractors on macOS/Linux could flatten paths. The repo build now
  zips via `tar --format zip` and refuses to ship a zip containing `\`
  entries.
- **License detection**: the provenance note appended after the MIT text in
  `LICENSE` made GitHub report the license as NOASSERTION. `LICENSE` is now
  the pristine MIT text; the note lives in `NOTICE.md`.
- `npm run typecheck` (`tsc --noEmit`) is clean again — strict-null fixes
  in `vcc.ts` and `test/vcc.test.ts` (the shipped sources are what
  downstream users typecheck).

### Added
- GitHub Pages landing page with an Add-to-VCC deep link (the Pages root
  was a 404).
- README quickstart + banner (EN/JA).
- `build-vpm-repo.mjs --prev <index.json>` merges already-published
  versions so the VPM listing keeps its history.

## [2.4.2] - 2026-08-07

### Added
- **`vpm_manage action:"create"` — full project bootstrap without Unity.**
  Copies a VCC template (`avatar` / `world` / `base` / any template folder
  name, case-insensitive) to a NEW directory (never overwrites), runs
  `vrc-get resolve` (templates declare packages but lock nothing), installs
  any `packages` extras, and registers the project in VCC's list
  (`register:false` to skip; a `.bak-unity-mcp` of settings.json is written,
  and if VCC is running its exit may drop the entry - opening the project
  from VCC once re-registers it). Follow-up steps report per-step exit codes
  instead of failing the whole call: once the copy succeeded the honest
  answer is "created, but step X needs a retry". Live-fired: real Avatar
  template + real resolve pulled VRChat SDK 3.10.4 and Modular Avatar 1.18.1
  into a throwaway project, verified via `vcc_project info`, then deleted.
  "Make me a new avatar project with MA installed" now works before Unity
  ever starts.

### Changed (UI polish, live feedback)
- Status window: the open-registry button is gone (debug-only surface that
  caused two live bugs - the GUI-pass focus loop and Windows'
  OpenWithDefaultApp dropping the last path segment); the language cycle
  button label is now Auto/EN/日本語 and fits.

## [2.4.1] - 2026-08-07

VCC/VPM write-path live round (F-22..F-28):
add / remove / resolve all verified against the real filesystem on a
throwaway project with a byte-identical baseline restore. Same-day fixes:

### Fixed
- **F-22**: vrc-get answers benign no-ops ("nothing to do": already
  installed, nothing to resolve) with exit 1 - that surfaced as
  `VRC_GET_FAILED`, making a success-equivalent look retryable. Now
  returns `ok({noop:true, exitCode:0})`.
- **F-23**: a vrc-get timeout kill decayed into a generic
  `HANDLER_EXCEPTION` with `retryable:false` and no detail. Timeouts are
  now `VRC_GET_FAILED` with `retryable:true`, the command, the timeout
  and a reconcile hint (`action:'resolve'`).
- **F-24**: unknown `action` values were rejected by the zod enum inside
  the MCP SDK - before `fail()` - so those errors carried no
  `server:{}` identity. Both VCC tools now take `action` as a string and
  validate in the handler: unknown actions answer `INVALID_PARAMS` with
  the full `{error, server}` block.
- **F-25**: the hand-built `VRC_GET_NOT_FOUND`, `STREAM_MODE_LOCKED`,
  `ARM_REQUIRED` and `CONFIRM_REQUIRED` blocks now carry
  `retryable:false` like every `fail()` answer.
- **F-27**: `vcc_project` is locked under `UNITY_MCP_STREAM_MODE` - it
  enumerates every project on the machine, and WIP project names are
  exactly what streaming mode exists to keep off screen.
- **F-28**: subprocess stderr on a *successful* vrc-get run (often
  OS-localized warning chatter) is returned as `warnings`, not `stderr`,
  so agents stop reading success as failure.

### Known (recorded, not fixed)
- **F-26**: vrc-get itself creates a minimal `Packages/vpm-manifest.json`
  on first use, so an add→remove round trip on a virgin project leaves
  that file behind (`hasVpmManifest` flips true). vrc-get's file, not
  ours; harmless, and `resolve` semantics depend on it existing.

## [2.4.0] - 2026-08-07

The editorless round: manage a VRChat project before Unity is even
running, and a status window worth looking at — in two languages.

### Added
- **VCC/VPM layer — two new tools that need NO running Unity Editor.**
  `vcc_project` lists every project the VRChat Creator Companion knows
  about (existence, Unity version, VPM manifest) and reads one project's
  locked packages plus legacy Assets-era folder flags — pure file reads,
  zero external dependencies. `vpm_manage` adds / removes / resolves /
  lists repositories / reports outdated packages through the open-source
  `vrc-get` CLI (`repos|search|outdated|add|remove|resolve|update_repos`);
  without vrc-get on PATH it fails with `VRC_GET_NOT_FOUND` and install
  instructions while `vcc_project` keeps working. Non-zero exits surface
  as `VRC_GET_FAILED` with the full command, output and stderr in detail.
  `vpm_manage` is locked under `UNITY_MCP_STREAM_MODE` like the other
  destructive tools. Tool surface: 13 → 15.
- **Japanese UI + docs.** The status window and its menus are localized
  (EN/JA, auto-detects the editor OS language, cycle button persists the
  choice via EditorPrefs); `README.ja.md` and `docs/INSTALL.ja.md` are
  full translations shipped in the release tree. Protocol errors and tool
  payloads intentionally stay English (machine/AI-facing; `csCode` remains
  the stable key per the F-9 ruling).
- **Status window redesign.** Larger state dot + headline with the plugin
  version; facts box now shows the project name, connected client NAMES
  (not just a count - `TcpHost.ClientNames`), eval engine, lease holder
  and the last real command with an age label
  (`Dispatcher.LastRequestMethod`, sys.* chatter excluded); setup helpers:
  copy a ready-to-paste MCP client config JSON, copy the health URL, open
  the discovery registry folder.

## [2.3.9] - 2026-08-07

External-AI contract review round: the public tree was reviewed by a
GPT-class model acting as a first-time AI client. Its confirmed findings
(several of its quoted lines turned out to be fabrications and were
discarded after source-grep) are all wording/contract fixes — no behavior
changes.

### Docs / contract wording
- `docs/PROTOCOL.md`: the `hello` frame table now includes the **required
  `client.token`** (the prose demanded it since v2.1 but the table omitted
  it — the exact trap that had killed `smoke-p1.mjs`, F-19); "one per
  Claude client" → any MCP host; `pong` id reuse stated in the envelope
  rules; HTTP preamble explicitly "health snapshot only, not an RPC
  transport".
- `README.md`: architecture header names the real npm package
  (`tunasync-unity-mcp`, not the internal `@tunasync/...` name); recipe
  paragraph says to paste the **fenced C# block** (not the whole markdown
  file) and that `args` is a variable in the source, not a tool parameter;
  source-install commands no longer break on a `cd server` working
  directory; `legacy-v1` references marked as development-repo lineage not
  present in the release tree; license section points at the MIT `LICENSE`
  file.
- `docs/INSTALL.md`: "one-step installs"/"only click, ever" made accurate
  (per-project consent); security model wording de-absolutized (bridge
  itself sends nothing vs. VRC SDK/npx network actions; same-user/admin
  processes and the tokenless health peek called out); new section **"Arming
  a real VRChat upload (no repo checkout needed)"** — VCC+npx users have no
  `tools/arm-vrc-upload.bat`, so the manual one-liner is documented.
- Tool descriptions: `execute_editor_command` says to pass the fenced C#
  code, not a recipe file; `vrc_upload` states that omitting `dry_run`
  selects the REAL path and that `confirm:true` means fresh approval of
  THIS upload, not a general work request.
- `armGate.ts` header comment: "one arm = at most one attempt" corrected to
  an armed attempt window with best-effort consumption bounded by the TTL.

## [2.3.8] - 2026-08-07

Multi-project / multi-client live round (F-19..F-21). The headline itself
passed: 2 editors + 3 simultaneous clients
(`clients:3` measured), project selectors fully disjoint, leases independent
per project and stealable across clients both ways, one editor frozen for
140 s leaves the other untouched. `PROJECT_AMBIGUOUS` and `AUTH_REQUIRED`
got their first live firings.

### Fixed
- **F-19: `tools/smoke-p1.mjs` could not run at all since v2.1 auth** — it
  read the registry token but never echoed it as `hello.client.token`, so
  every start died as `timeout waiting __welcome__` while the real cause
  (`AUTH_REQUIRED`) landed unobserved in the event bucket. Now sends the
  token and surfaces pre-welcome refusals with their error code.
- **F-21 (regression): `unity_health_check` reported a frozen editor as
  `status:"ok"`.** `sys.status` answers on the plugin's transport thread, so
  a blocked main thread still returns it and the connected-client fast path
  never consulted the `lastTickAgoMs` evidence it was already carrying
  (2.3.5 surfaced the same freeze as BUSY_MODAL). The verdict is now derived
  from `lastTickAgoMs` with the same 3000 ms threshold as the plugin's
  BUSY_MODAL watchdog: `status:"unresponsive"` + a detail line while the
  editor is stalled.
- **F-20: HTTP health peek answered and then reset the connection.** The
  one-shot HTTP branch closed the socket with unread request bytes in the
  receive buffer, so Windows sent RST and strict clients (node/fetch) saw
  `ECONNRESET` before parsing the 200 (11/14 repro on a process's first
  request; WinHTTP tolerated it). The plugin now flushes, sends FIN
  (`Shutdown(Send)`), and drains the rest of the request before closing.

## [2.3.7] - 2026-08-07

World-path live round (F-14..F-18; the
headline `vrc_upload {target:"world", dry_run:true}` itself passed).

### Added
- **F-14/F-15: eval auto-wrap.** `execute_editor_command` now accepts raw
  statement snippets: when the source does not define `class EditorCommand`,
  the plugin wraps it into the contract, hoists the caller's own top-level
  `using` lines, honors the recipe `// requires-using:` header, and prepends
  a standard editor using set (with `Debug` aliased to `UnityEngine.Debug`).
  When the body reads an `args` variable it never binds (many recipe files
  under-declare `params:` in their front matter — a full-corpus compile gate
  found 101 such bodies), the wrapper also stubs
  `var args = JObject.Parse("{}")` so the recipe runs and reports its own
  `"<field> required"` error instead of failing with CS0103.
  Responses carry `wrapped`; compile diagnostics are mapped back to the
  caller's input lines. This makes the recipe corpus and the docs-style
  top-level examples paste-runnable exactly as README promised
  (verified by a batchmode gate compiling every shipping recipe body
  through the real EvalWrap + csc pipeline).
- **F-18: world dry_run coverage 4 → 10 checks + info counts.** Added spawns,
  ReferenceCamera, RespawnHeightY (>= 0 warning), `scriptCompilationFailed`
  (error), BuildTarget and ColorSpace to `DryRunWorld`; `info` now carries
  audioListenerCount / canvasCount / eventSystemCount. An EventSystem
  *warning* was tried and immediately reverted to an info count: the live
  smoke fired it on a published, working world (73 Canvases, 0 EventSystems)
  — VRChat's client supplies UI input, so absence is normal (matches the
  legacy checker, which only ever reported `eventSystemCount`). Not covered
  (documented as such): lightmap state, layer anomalies, InternalErrorShader
  scans.

### Fixed
- **F-17: hand-built early-return errors now carry `server:{…}`.**
  `ARM_REQUIRED`, `CONFIRM_REQUIRED` and `STREAM_MODE_LOCKED` were the three
  error shapes built outside `fail()` and therefore missed the server
  identity block; all three now emit the same `{error, server}` JSON sibling
  shape as `fail()`.
- **F-18 (redirect wording)**: `vrc_preupload_check` / `vrc_world_upload`
  recipe redirects now name the real MCP parameter (`dry_run`, not the
  plugin-internal `dryRun`), state the dry-run coverage list, and repeat the
  arm-file rule for the real path.

### Docs
- **F-14**: tool description states the eval contract + auto-wrap; README
  recipe paragraph now describes the `params:`/`args` caveat;
  `VRC_UPLOAD_REALFIRE.md` Phase 1 example annotated (auto-wrap 2.3.7+).
- **F-16**: `INSTALL.md` gains an "Updating the server" section — MCP
  clients cache the tool list per session; reconnect after a server update
  or new parameters are rejected as input-validation errors even though the
  running server supports them.

## [2.3.6] - 2026-08-06

### Added
- **F-13 completion (final-report follow-up)**: every ERROR response from
  every tool now carries `server: {version, build, pid, startedAt}` in its
  JSON block — as a **sibling of `error`**, not inside `error.detail`, so no
  per-error detail shape is polluted (wording precision per the live
  verification, which confirmed the placement at 6 distinct construction
  sites). The moment you most need to know which server answered is when it
  errors (a `BUSY_MODAL` mid-stale-build-hunt). Health already had it on its
  status answers.

### Docs
- Tester's end-to-end verification
  report checked into the repo (13/13 findings closed, 13/13 tools
  live-verified, F-4 upgraded to live-confirmed — the "unreachable" call was
  wrong: with a fresh heartbeat the resolve path succeeds and the plugin
  watchdog answers with the F-4 payload; with a stale heartbeat the F-12
  server path answers. Non-deterministic but both diagnoses are correct.)

## [2.3.5] - 2026-08-06

### Added
- **F-13: `unity_health_check` identifies the server itself.** Every health
  answer (ok / unresponsive / no_unity / ambiguous / not_found) now carries
  `server: {version, build, pid, startedAt}` — `build` is the bundle
  timestamp stamped by esbuild (`"dev"` when running from src). Three
  same-day "tested a stale server process" incidents were only caught by
  hand-comparing node start time against the bundle mtime; now the response
  itself proves which build answered.

## [2.3.4] - 2026-08-06

### Changed
- Vocabulary alignment (live-retest follow-up, optional nit): when zero
  registry entries are alive but at least one is `unresponsive`,
  `unity_health_check` reports top-level **`status:"unresponsive"`** instead
  of `"no_unity"` — matching what every other tool says about the same
  editor at the same moment. `"no_unity"` is reserved for genuinely absent
  editors. Detail wording unchanged.

## [2.3.3] - 2026-08-06

### Fixed
- **F-12: a blocked editor no longer reads as "no running Unity Editor"** on
  every non-health tool. `resolveProject` used to filter to alive entries and
  fall through to `PROJECT_NOT_FOUND` (factually wrong, `retryable:false`,
  candidates lost) while `unity_health_check` told the truth. A matching
  entry whose pid is alive but whose heartbeat stalled now throws
  **`BUSY_MODAL`, `retryable:true`**, with
  `detail:{candidates[{...,reason:"unresponsive"}], heartbeatAgeMs}` and a
  "retry once the editor unblocks" message — shared by every tool that
  resolves a project. `unity_health_check` maps that case to
  `status:"unresponsive"` when it reaches resolve (mixed alive/blocked
  registries); the zero-alive early path keeps the F-11 wording.
- `PROJECT_NOT_FOUND` now always carries `detail.candidates` (all registry
  entries incl. dead ones with their reason) — the regression the live
  retest called out (candidates had been the strength of this error).

## [2.3.2] - 2026-08-06

Completion pass (server-side; plugin bumped for lockstep).

### Fixed
- **F-7 log id spaces**: `get_logs` ring entries now carry `pluginId` — the
  plugin-side LogCapture id, which is the id space eval-response `logs[]`
  use — alongside the server-ring `id` (the `since_id` key). The two spaces
  stay distinct on purpose (plugin ids reset on domain reload); they are now
  cross-referenceable and the tool description says which is which.
- Ring entries never carried a stack: the server read `stack` while the
  plugin serializes `firstStackLine`. Both are accepted now, and stack-regex
  filtering works on ring entries again.

### Added
- `test/smoke-f10-bundle.ts` (`npx tsx`): bundle-level E2E that runs the
  SHIPPED `build/index.js` over real stdio + TCP against the mock plugin and
  asserts the F-10 summarization — vitest covers `src/`, this covers the
  artifact.

### Changed
- Won't-fix, recorded: **F-9** compiler messages stay in the Unity editor's
  own UI language by design (`csCode` is the stable machine key; the human
  text is for whoever runs that editor). **F-4** `BUSY_MODAL` detail is
  unreachable in normal operation since the AssetImportWorker guard (kept as
  defense in depth).
- `docs/PROTOCOL.md`: `job.status` all-form documented as a bare array.

## [2.3.1] - 2026-08-06

Live-retest follow-ups (server-side only; plugin bumped for lockstep).

### Fixed
- **F-10: `job_status` summarization was dead in practice.** The summarizer
  only matched a `{jobs:[...]}` wrapper, but the real plugin answers
  job.status(all) with a **bare array** (`JobManager.AllRecords()`) — the
  wrapper existed only in the test mock, so 84/84 green never exercised the
  real shape. The summarizer now accepts both shapes; the mock's builtin
  job.status was corrected to the real bare-array shape and the regression
  test fixtures use it.

### Changed
- **F-11 wording**: a registry entry whose pid is alive but whose heartbeat
  stalled (blocked main thread / hung editor) is now flagged
  `reason:"unresponsive"` instead of `"stale"`, and `unity_health_check`'s
  no-Unity answer explains that the process is likely still listening and the
  call should be retried once the editor unblocks. (Found by blocking the
  main thread 150 s: classification was correct, the "no running Unity
  Editor" message was misleading.)

## [2.3.0] - 2026-08-06

Fixes for the 2026-08-06 live full-surface test
(live findings round, run on a real avatar project).

### Fixed
- **F-1 `scene_query` type filtering**: the documented `t:Component` syntax is
  now implemented (plugin-side), `*`/`?` name wildcards work, `type` matches
  short or full type names, and `query` is optional on the MCP surface — the
  live failure was the server *requiring* `query`, so type-only searches
  always ran a name-AND-type filter that matched nothing.
- **F-2 `session_lease` parameters**: `ttl_s` is now honored end-to-end
  (per-acquire/takeover TTL, clamped 5 s–1 h, activity-refresh keeps the
  custom TTL). `client_id` is removed from the tool schema instead of being
  silently ignored — lease identity is the connection session (its liveness
  backs disconnected-holder steal), and the plugin now answers a foreign
  `clientId` with INVALID_PARAMS explaining that contract.
- **F-6 `EVAL_RUNTIME_ERROR` log loss**: runtime-error responses now carry the
  logs captured before the throw in `error.detail.logs` (same entry shape as
  the success path), alongside the existing `unityStack`/`consoleErrors`.
- **F-3 docs**: eval level corrected to effective **C#10** (C#11 features are
  preview/CS8652 on Unity 2022.3's bundled Roslyn).

### Changed
- **F-4 `BUSY_MODAL` diagnosability**: the error now carries
  `detail: {pid, projectPath, projectName, batchMode, lastTickAgoMs}` and is
  `retryable:false` with an explicit hint when the answering process is
  batchmode (the stale-AssetImportWorker case that delayed the 2026-08-06
  incident diagnosis); transient editor stalls stay `retryable:true`.
- **F-5 `job_status` all-jobs listing** is summarized by default (identity +
  progress + `{code,message}` errors; no `result`/`logs` payloads — a single
  eval job carried ~180 log entries). `include_details:true` or `job_id`
  returns full records.
- **F-8** `ndmf_bake_run` description now states that bake output stays in
  `Assets/UnityMCP_Bakes/` and should be cleaned after validation runs.
- Deferred: F-7 (dual log id spaces — needs a design pass over ring vs eval
  scope ids), F-9 (locale-dependent compiler messages — `csCode` already
  carries the stable signal).
- Versions 2.3.0 in lockstep. Tests 80 → 84. Plugin compile-gated on a clean
  2022.3.22f1 batchmode project (0 CS errors).

## [2.2.0] - 2026-08-06

Operator-safety layer (server-side).

### Added
- **Human arm gate for real `vrc_upload`** (`src/armGate.ts`): a real upload
  now requires BOTH `confirm:true` (caller intent) and a human-created
  one-shot arm file (operator intent) — `tools/arm-vrc-upload.bat` /
  `disarm-vrc-upload.bat`, default
  `%LOCALAPPDATA%/UnityMCP/arm/vrc-upload.arm`, TTL 30 min
  (`UNITY_MCP_ARM_TTL_MIN`), consumed per attempt, `UNITY_MCP_ARM_FILE`
  override. Missing/stale arm → `[ARM_REQUIRED]`, nothing is submitted.
  `dry_run` is unaffected. Runbook: `docs/VRC_UPLOAD_REALFIRE.md`.
- **Streaming mode** (`src/streamMode.ts`, `UNITY_MCP_STREAM_MODE=1`): locks
  `execute_editor_command`, `ndmf_bake_run`, `vrc_upload` (incl. dry_run) and
  `session_lease{takeover}` with `[STREAM_MODE_LOCKED]`, and masks
  `<drive>:\Users\<name>` segments plus `UNITY_MCP_STREAM_MASK` custom terms
  in all tool output, error text and progress messages. Read/query tools stay
  available. Docs: `docs/STREAMING.md`.

### Changed
- `vrc_upload` tool description documents the double gate. Server + plugin
  versions 2.2.0 in lockstep (plugin code unchanged — version constant only).
  Tests 62 → 80 (arm gate, stream locks, masking units).
- Real `vrc_upload` no longer labeled experimental: the live publish path was
  verified the same day on a real avatar project
  (tester live report §1-14, pre-arm-gate session).

## [2.1.0] - 2026-08-06

Distribution hardening.

### Added
- First-run consent gate (per user x per project): the listener never
  starts for a user who has not agreed. GUI shows a one-time dialog;
  decision stored in `%LOCALAPPDATA%/UnityMCP/consent/<hash8>.json`;
  `UNITY_MCP_AUTOCONSENT=1` covers fleet/CI headless use. Menu + Status
  Window expose enable/disable.
- Same-user auth: per-editor-session 32-hex token published only via the
  user-ACL'd registry file; clients echo it as `hello.client.token`;
  mismatch -> `AUTH_REQUIRED` (constant-time compare). HTTP health stays
  tokenless.
- npm packaging for the server (`tunasync-unity-mcp`, bin + bundled
  recipe library, MIT).

### Fixed
- AssetImportWorker processes no longer run the bootstrap. Previously a
  worker (spawned by heavy imports, sharing the project's consent) would
  start its own listener and clobber the discovery registry entry, so
  clients connected into a process with no editor loop and saw endless
  BUSY_MODAL. Registry invariant now: one project = one entry, written by
  the MAIN editor only.

### Changed
- Distribution recipe set excludes owner-specific categories and
  parameterizes environment paths. Root LICENSE is MIT for the v2 tree
  (CC BY-NC lineage lives only on `legacy-v1`).

## [2.0.0] - 2026-08-05

Ground-up rewrite. Legacy 426-tool fork preserved on `legacy-v1`
(tag `v1-final`).

### Added
- Plugin-hosted TCP listener (port 47700+hash, discovery registry,
  multi-client, multi-project) — replaces the single :8080 WebSocket.
- Correlation ids + tombstones; reconnect state machine; BUSY_MODAL watchdog.
- Domain-reload ritual with persisted compile diagnostics
  (`sys.compile.status`) and same-port re-bind.
- Job manager (progress streaming, SessionState persistence,
  JOB_NOT_RESUMABLE determinism); NDMF bake and VRC upload as jobs.
- Out-of-proc Roslyn eval via Unity's bundled toolchain (C#10/11, errors-first
  line/col diagnostics, source-hash cache, zero bundled DLLs).
- Session write-lease (TTL 120 s, takeover, disconnected-holder steal).
- 13-tool MCP surface + 428-recipe library with `find_recipe` and
  `recipe://` resources.
- VPM/UPM package `com.tunasync.unity-mcp` with versionDefines-gated
  VRC SDK / NDMF integration; `tools/install-to-project.ps1` file: installer.
- `UnityMCP.disabled` kill switch (recovered from the 2026-06-15 deployed
  delta, now a first-class feature).

### Removed
- 413 thin wrapper tools (preserved as recipes).
- CodeDomCompiler fallback (the only CC BY-NC-derived file; license-clean).

### Fixed (vs v1)
- Compile-wait main-thread deadlock; ghost socket close; correlation-less
  response mixing; :8080 double-bind between MCP clients; fire-and-forget
  long operations with no completion signal.
