# Smoke Test Protocol v2

Release gate for TunaSync Unity MCP. Run top to bottom; every line must PASS.
Scripted gates live in `tools/`; each prints `SUMMARY n/n passed` and exits
nonzero on failure.

## 0. Prerequisites

- `cd server && npm run typecheck && npm test && npm run build` — all green.
- A testbed Unity project with the package installed
  (`tools/install-to-project.ps1`) and the editor RUNNING
  (headless ok: `Unity.exe -batchmode -nographics -projectPath <p>`).
- Registry entry visible: `%LOCALAPPDATA%\UnityMCP\registry\*.json` with the
  project path and a live pid.

## 1. Transport gate — `node tools/smoke-p1.mjs <projectSubstring>`

handshake/welcome, 10-parallel correlation, sys.info/status,
METHOD_NOT_FOUND, ping-pong, lease acquire → LEASE_HELD → takeover →
lease.lost event, HTTP health peek (`curl http://127.0.0.1:<port>/`).
11 checks.

## 2. Eval + jobs gate — `node tools/smoke-p2.mjs <projectSubstring>`

C#10 eval + Debug.Log capture + engine "csc", cache hit, syntax error →
errors-first diagnostics with line/col, runtime error, job
submit/wait/progress/cancel, script-write → double domain reload → bye →
reconnect → compile.status → new class usable → spanning job =
JOB_NOT_RESUMABLE. 19 checks. (Probe file content is stamped per run —
identical content would make Refresh a no-op.)

## 3. Full-chain MCP gate — `node tools/smoke-p3-mcp.mjs <projectSubstring>`

Real stdio server → TCP → plugin: initialize, 18 tools listed, health,
eval, sectioned state, scene_query, get_logs, find_recipe
(exact / keyword / redirect), job_status, camera_capture (PNG even under
-nographics via temp-camera fallback). 12 checks.

## 4. SDK testbed (defines ON — VRC avatars + NDMF stack)

- Compile: 0 errors with MCP_VRCSDK3_AVATARS / MCP_NDMF active.
- `welcome.features` includes `ndmf`, `vrcAvatars`.
- `vrc_avatar_audit` on a real avatar returns all requested checks.
- `ndmf_bake_run` on a real avatar: progress stream → output prefab exists;
  prefab still healthy after editor restart.
- `vrc_upload {dry_run:true}`: structured {valid, issues[]} on a real
  descriptor. REAL upload is never part of the gate (publishes content).

## 5. Migration / coexistence (scratch copy of a real project)

- Old `Assets\UnityMCPPlugin` + new package coexist: project compiles
  (different asmdef/namespace), old listener on 8080, new on 477xx.
- Remove old folder → still compiles, tools keep working.

## 6. Operational checks

- Kill the editor process → registry entry swept on next start; server
  reports UNITY_UNREACHABLE fast, reconnects when the editor returns.
- Two editors on two projects: server routes by `project` argument;
  ambiguous selector → PROJECT_AMBIGUOUS listing candidates.
- `UnityMCP.disabled` marker → no listener, no registry entry.

## Result classification

- PASS — check green.
- FAIL — investigate before release; no PARTIAL category exists in v2
  (empty/placeholder results are bugs by definition).
