// MCP tool surface (P3: final 13 tools). Tools are declared in a small table
// so later phases can append entries without touching the registration
// plumbing. Every handler is wrapped: UnityClient errors become
// "[CODE] message" content plus a structured detail JSON block - a tool never
// throws raw. Wire params are camelCase (snake_case is MCP-surface only).

import { z } from "zod";
import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "../config.js";
import { UnityMcpError, hintFor, makeError, toUnityMcpError } from "../errors.js";
import type { ErrorObj } from "../protocol.js";
import type { RecipeLibrary } from "../recipes.js";
import type { UnityClient } from "../unity/client.js";
import type { ProjectPool } from "../unity/pool.js";
import { makeProgressBridge, type ProgressBridge, type ToolExtra } from "./progress.js";
import { enrichBusyModal, probeBlockedEditor } from "../unity/blockedProbe.js";
import { armRequiredResult, checkArm, consumeArm } from "../armGate.js";
import { serverIdentity } from "../version.js";
import {
  VRC_GET_INSTALL_HINT,
  VrcGetTimeoutError,
  cleanDerivedLibrary,
  closeProcessGracefully,
  createProject,
  defaultRunner,
  editorOpenOn,
  describeNativeDialogs,
  findUnityPidByProject,
  findVrcGet,
  isUnityPid,
  killProcess,
  launchUnity,
  listProjects,
  pidAlive,
  projectInfo,
  readEditorRegistry,
  registerInVcc,
  resolveUnityExe,
  vpmActionSpec,
  type VrcGetRunner,
} from "../vcc.js";
import {
  STREAM_DISABLED,
  maskResult,
  maskText,
  streamLockReason,
  streamLockedResult,
  type StreamModeState,
} from "../streamMode.js";

export interface ToolContext {
  pool: ProjectPool;
  cfg: Config;
  recipes: RecipeLibrary;
}

const LIGHT_CALL_TIMEOUT_MS = 10_000;
const QUERY_CALL_TIMEOUT_MS = 30_000;
const CAPTURE_CALL_TIMEOUT_MS = 60_000;
const AUDIT_CALL_TIMEOUT_MS = 60_000;
const JOB_SUBMIT_TIMEOUT_MS = 15_000;
/** Local slack past the wire job.wait timeout so the plugin answers first. */
const JOB_WAIT_SLACK_MS = 5_000;

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function okText(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

// F-5: discovery's F-12 short-circuit needs the active config to probe the
// blocked editor; set once at registration (single funnel = fail()).
let enrichCfgRef: Config | null = null;

async function fail(err: unknown): Promise<CallToolResult> {
  let obj = toUnityMcpError(err).obj;
  try {
    // F-5: an F-12 "unresponsive" BUSY_MODAL carries no modal name - ask the
    // blocked editor live (transport thread answers while main is stuck).
    obj = await enrichBusyModal(enrichCfgRef, obj);
  } catch {
    // Enrichment is best-effort; the original error always ships.
  }
  // F-13 completion: the moment you most need to know WHICH server answered
  // is when it answers with an error (BUSY_MODAL during a stale-build hunt),
  // so every error carries the server identity, not just health responses.
  const hint = hintFor(obj);
  return {
    content: [
      { type: "text", text: `[${obj.code}] ${obj.message}` + (hint ? `\n${hint}` : "") },
      { type: "text", text: JSON.stringify({ error: obj, server: serverIdentity() }, null, 2) },
    ],
    isError: true,
  };
}

function isCode(err: unknown, code: string): boolean {
  return err instanceof UnityMcpError && err.code === code;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });
}

const projectArg = z
  .string()
  .optional()
  .describe("Project path or name substring; optional when only one Unity is running");

// F-21: health verdict threshold for a stalled editor main thread. Keep in
// lockstep with the plugin's Dispatcher.BusyModalThresholdMs (3000).
const UNRESPONSIVE_TICK_MS = 3_000;

// vpm_manage shells out through this indirection so tests can inject a fake
// vrc-get without spawning processes.
let vpmRunner: VrcGetRunner = defaultRunner;
export function setVpmRunner(runner: VrcGetRunner): void {
  vpmRunner = runner;
}

/**
 * vpm_manage action:"create" - template copy + resolve + extras + VCC
 * registration. The copy either fully succeeds or throws before touching
 * anything; the follow-up steps report their own exit codes instead of
 * failing the whole call, because at that point the project EXISTS and the
 * honest answer is "created, but step X needs a retry".
 */
async function vpmCreate(args: {
  project?: string;
  template?: string;
  packages?: string[];
  register?: boolean;
  timeout_ms: number;
}): Promise<CallToolResult> {
  if (!args.project) {
    return fail(
      new UnityMcpError({
        code: "INVALID_PARAMS",
        message: "vpm_manage create: 'project' (the NEW directory to make) is required",
        retryable: false,
      }),
    );
  }
  if (vpmRunner === defaultRunner && findVrcGet() === null) {
    // resolve is integral to create (templates declare packages but lock
    // nothing), so require the CLI up front instead of leaving a half-set-up
    // project as a surprise. An injected runner (tests) spawns nothing.
    return fail(
      new UnityMcpError({
        code: "VRC_GET_NOT_FOUND",
        message: VRC_GET_INSTALL_HINT,
        retryable: false,
      }),
    );
  }
  let created;
  try {
    created = createProject(args.template ?? "avatar", args.project);
  } catch (err) {
    return fail(
      new UnityMcpError({
        code: "INVALID_PARAMS",
        message: `vpm_manage create: ${(err as Error).message}`,
        retryable: false,
      }),
    );
  }

  const steps: Array<Record<string, unknown>> = [];
  const runStep = async (label: string, argv: string[]): Promise<void> => {
    try {
      const run = await vpmRunner(argv, args.timeout_ms);
      const step: Record<string, unknown> = { step: label, exitCode: run.code };
      if (run.code !== 0 && !/nothing to do/i.test(run.stderr)) {
        step.stderr = run.stderr.slice(0, 4 * 1024);
        step.hint = `retry with vpm_manage action:'${label.startsWith("add") ? "add" : "resolve"}'`;
      } else if (run.code !== 0) {
        step.exitCode = 0;
        step.noop = true;
      }
      steps.push(step);
    } catch (err) {
      steps.push({ step: label, error: (err as Error).message });
    }
  };

  await runStep("resolve", ["resolve", "--project", args.project]);
  for (const pkg of args.packages ?? []) {
    await runStep(`add ${pkg}`, ["install", "-y", "--project", args.project, pkg]);
  }

  const body: Record<string, unknown> = { ...created, steps };
  if (args.register !== false) {
    const reg = registerInVcc(args.project);
    body.vccRegistration = {
      ...reg,
      note:
        "if VCC was running, it may rewrite settings.json on exit and drop this " +
        "entry - opening the project from VCC once re-registers it",
    };
  }
  body.next =
    "open the project in Unity (first import takes a while); the MCP plugin is NOT " +
    "included by default - run install-to-project or add the VPM package if you want it";
  return ok(body);
}

// ---- job flow helpers (shared by ndmf_bake_run / vrc_upload / eval jobs) ----

const JOB_SUMMARY_KEYS = [
  "jobId",
  "method",
  "state",
  "phase",
  "pct",
  "startedAt",
  "finishedAt",
  "updatedAt",
] as const;

/**
 * All-jobs listing: keep identity/progress fields, drop result/logs payloads
 * (a single eval job can carry hundreds of log entries). Full records stay
 * available via job_id or include_details:true.
 *
 * The REAL plugin answers job.status(all) with a BARE ARRAY of JobRecords
 * (JobManager.AllRecords()); a {jobs:[...]} wrapper is tolerated too. The
 * 2026-08-06 live retest (F-10) caught this fn matching only the wrapper the
 * mock happened to use - never trust a mock shape the plugin doesn't produce.
 */
function summarizeJobList(result: unknown): unknown {
  const wrapped =
    !Array.isArray(result) &&
    typeof result === "object" &&
    result !== null &&
    Array.isArray((result as Record<string, unknown>).jobs);
  const jobsRaw: unknown[] | null = Array.isArray(result)
    ? result
    : wrapped
      ? ((result as Record<string, unknown>).jobs as unknown[])
      : null;
  if (jobsRaw === null) return result;
  const jobs = jobsRaw.map((j) => {
    if (typeof j !== "object" || j === null) return j;
    const job = j as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of JOB_SUMMARY_KEYS) {
      if (job[key] !== undefined) out[key] = job[key];
    }
    const err = job.error;
    if (typeof err === "object" && err !== null) {
      const e = err as Record<string, unknown>;
      out.error = { code: e.code, message: e.message };
    }
    return out;
  });
  return {
    ...(wrapped ? (result as Record<string, unknown>) : {}),
    jobs,
    summarized: true,
    hint: "pass job_id (or include_details:true) for full records incl. result/logs",
  };
}

function extractJobId(x: unknown): string | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  return typeof o.jobId === "string" && o.jobId.length > 0 ? o.jobId : null;
}

/**
 * Long-poll job.wait, forwarding plugin progress frames to MCP progress
 * notifications. On wait timeout the job is NOT cancelled - the jobId is
 * reported so the caller can poll job_status or cancel explicitly.
 */
async function waitForJob(
  client: UnityClient,
  jobId: string,
  timeoutMs: number,
  bridge: ProgressBridge,
  signal: AbortSignal,
): Promise<CallToolResult> {
  try {
    const result = await client.call(
      "job.wait",
      { jobId, timeoutMs },
      { timeoutMs: timeoutMs + JOB_WAIT_SLACK_MS, onProgress: bridge.onProgress, signal },
    );
    if (typeof result === "object" && result !== null) {
      const rec = result as Record<string, unknown>;
      if ((rec.state === "failed" || rec.state === "cancelled") && rec.error !== undefined) {
        return fail(new UnityMcpError(rec.error as ErrorObj));
      }
    }
    return ok(result);
  } catch (err) {
    if (isCode(err, "TIMEOUT")) {
      return ok({
        status: "wait_timeout",
        jobId,
        message:
          `job.wait exceeded ${timeoutMs} ms but the job is still running plugin-side. ` +
          `Poll it with job_status {"job_id":"${jobId}"} or stop it with job_cancel. ` +
          "It was NOT cancelled implicitly.",
      });
    }
    throw err;
  }
}

async function runJob(
  client: UnityClient,
  method: string,
  params: unknown,
  timeoutMs: number,
  bridge: ProgressBridge,
  signal: AbortSignal,
): Promise<CallToolResult> {
  const submitted = await client.call(
    "job.submit",
    { method, params },
    { timeoutMs: JOB_SUBMIT_TIMEOUT_MS, signal },
  );
  const jobId = extractJobId(submitted);
  if (jobId === null) {
    return fail(
      makeError("PROTOCOL_ERROR", `job.submit for ${method} returned no jobId`, {
        detail: { submitted },
      }),
    );
  }
  return waitForJob(client, jobId, timeoutMs, bridge, signal);
}

// ---- registration plumbing ----

/**
 * Stream-mode wrapper for the SDK extra: progress notification messages can
 * carry paths (bake output dirs, capture paths), so they are masked too.
 * Handlers only ever touch _meta, signal and sendNotification, which is what
 * this shallow wrapper forwards.
 */
function maskProgressExtra(extra: ToolExtra, stream: StreamModeState): ToolExtra {
  const wrapped = {
    _meta: extra._meta,
    signal: extra.signal,
    sendNotification: (notification: Parameters<ToolExtra["sendNotification"]>[0]) => {
      if (notification.method === "notifications/progress") {
        const params = notification.params as Record<string, unknown>;
        if (typeof params.message === "string") {
          notification = {
            ...notification,
            params: { ...params, message: maskText(params.message, stream) },
          } as typeof notification;
        }
      }
      return extra.sendNotification(notification);
    },
  };
  return wrapped as unknown as ToolExtra;
}

type ToolRegistrar = (server: McpServer, ctx: ToolContext) => void;

// MCP hosts use these hints to distinguish retrieval from writes and public
// side effects. Mixed-action tools are classified by their most consequential
// mode: annotations cannot vary with arguments, so safety wins over convenience.
const READ_ONLY_TOOL = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const satisfies ToolAnnotations;

const LOCAL_WRITE_TOOL = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
} as const satisfies ToolAnnotations;

const DESTRUCTIVE_LOCAL_TOOL = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
} as const satisfies ToolAnnotations;

const DESTRUCTIVE_OPEN_WORLD_TOOL = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: true,
} as const satisfies ToolAnnotations;

const TOOL_ANNOTATIONS = {
  // Arbitrary C# can mutate/delete local data or reach external systems.
  execute_editor_command: DESTRUCTIVE_OPEN_WORLD_TOOL,
  // wake=true restores/focuses the editor, so this is not strictly read-only.
  unity_health_check: LOCAL_WRITE_TOOL,
  get_editor_state: READ_ONLY_TOOL,
  scene_query: READ_ONLY_TOOL,
  // output_path can overwrite an existing PNG.
  camera_capture: DESTRUCTIVE_LOCAL_TOOL,
  // Creates a unique baked prefab and leaves the source avatar untouched.
  ndmf_bake_run: LOCAL_WRITE_TOOL,
  // The same tool contains dry-run and real public-publish modes.
  vrc_upload: DESTRUCTIVE_OPEN_WORLD_TOOL,
  vrc_avatar_audit: READ_ONLY_TOOL,
  find_recipe: READ_ONLY_TOOL,
  // clear=true irreversibly clears buffered/editor logs.
  get_logs: DESTRUCTIVE_LOCAL_TOOL,
  session_lease: LOCAL_WRITE_TOOL,
  job_status: READ_ONLY_TOOL,
  job_cancel: DESTRUCTIVE_LOCAL_TOOL,
  vcc_project: READ_ONLY_TOOL,
  // remove can delete packages; create/add/resolve also mutate project files.
  vpm_manage: DESTRUCTIVE_LOCAL_TOOL,
  // launch spawns a process, quit terminates one (forced kill can corrupt
  // Library) - status alone would be read-only, strongest side wins.
  unity_editor: DESTRUCTIVE_LOCAL_TOOL,
  // imports can overwrite existing assets at the same paths.
  asset_import: DESTRUCTIVE_LOCAL_TOOL,
  vrc_menu: READ_ONLY_TOOL,
} as const satisfies Record<string, ToolAnnotations>;

type ToolName = keyof typeof TOOL_ANNOTATIONS;

/**
 * Parsed-args type for a raw zod shape; mirrors the SDK's ShapeOutput for
 * zod v3 schemas (optional fields become `T | undefined`, key stays present).
 */
type ArgsOf<S extends z.ZodRawShape> = { [K in keyof S]: z.infer<S[K]> };

/** Declare one tool; wraps the handler so errors never escape raw. */
function tool<S extends z.ZodRawShape>(
  name: ToolName,
  description: string,
  schema: S,
  handler: (args: ArgsOf<S>, ctx: ToolContext, extra: ToolExtra) => Promise<CallToolResult>,
): ToolRegistrar {
  return (server, ctx) => {
    const cb = async (args: ArgsOf<S>, extra: ToolExtra): Promise<CallToolResult> => {
      const stream = ctx.cfg.stream ?? STREAM_DISABLED;
      const lockReason = streamLockReason(name, args as Record<string, unknown>, stream);
      if (lockReason !== null) return streamLockedResult(lockReason);
      const wrappedExtra = stream.enabled ? maskProgressExtra(extra, stream) : extra;
      try {
        return maskResult(await handler(args, ctx, wrappedExtra), stream);
      } catch (err) {
        return maskResult(await fail(err), stream);
      }
    };
    // SDK glue: ToolCallback<S> is a conditional type that stays deferred for
    // a generic S, so the correctly-shaped callback cannot be proven
    // assignable here without erasing the generic. The shapes match (same
    // args mapping, same extra, same CallToolResult).
    server.registerTool(
      name,
      { description, inputSchema: schema, annotations: TOOL_ANNOTATIONS[name] },
      cb as unknown as ToolCallback<S>,
    );
  };
}

// ---- tool table (15: 13 editor tools + the editorless VCC/VPM pair) ----

const toolTable: readonly ToolRegistrar[] = [
  tool(
    "execute_editor_command",
    "Compile and run a C# snippet inside the Unity Editor (eval.run). " +
      "Raw statement snippets and recipe C# bodies are accepted (pass the " +
      "fenced C# code, not a whole recipe markdown file): when the source " +
      "does not define 'class EditorCommand { static object Execute() }' it is " +
      "auto-wrapped into that contract with a standard editor using set " +
      "(response carries wrapped:true; diagnostic lines map to your input). " +
      "Returns the eval result, captured logs, execution time and engine. " +
      "run_as_job=true runs it as a background job and waits for completion.",
    {
      code: z
        .string()
        .describe(
          "C# source: either statements/method-body (auto-wrapped) or a full " +
            "'class EditorCommand { static object Execute() }' definition",
        ),
      timeout_ms: z.number().int().positive().optional().describe("Per-call timeout in ms"),
      capture_logs: z.boolean().optional().describe("Capture console logs during execution (default true)"),
      run_as_job: z
        .boolean()
        .optional()
        .describe("Run as a resumable background job; survives longer operations"),
      allow_play_mode: z
        .boolean()
        .optional()
        .describe(
          "Permit execution while the editor is in play mode (default false = " +
            "blocked with PLAY_MODE_ACTIVE, because play-mode scene edits revert " +
            "on exit while asset changes persist)",
        ),
      project: projectArg,
    },
    async (args, ctx, extra) => {
      const { client } = ctx.pool.resolve(args.project);
      const timeoutMs = args.timeout_ms ?? ctx.cfg.defaultTimeoutMs;
      const bridge = makeProgressBridge(extra);
      try {
        const evalParams = {
          code: args.code,
          captureLogs: args.capture_logs ?? true,
          ...(args.run_as_job === true ? { runAsJob: true } : {}),
          ...(args.allow_play_mode === true ? { allowPlayMode: true } : {}),
        };
        const result = await client.call("eval.run", evalParams, {
          timeoutMs: args.run_as_job === true ? JOB_SUBMIT_TIMEOUT_MS : timeoutMs,
          onProgress: bridge.onProgress,
          signal: extra.signal,
        });
        if (args.run_as_job === true) {
          const jobId = extractJobId(result);
          if (jobId !== null) {
            return await waitForJob(client, jobId, timeoutMs, bridge, extra.signal);
          }
          // Plugin executed inline despite runAsJob (small snippet): passthrough.
        }
        return ok(result);
      } finally {
        bridge.done();
      }
    },
  ),

  tool(
    "unity_health_check",
    "Report Unity plugin health: discovery, TCP connection state and a live " +
      "sys.status snapshot. Every answer carries server{version, build, pid, " +
      "startedAt} identifying THIS server process/build. wake=true calls " +
      "editor.wake; verbose=true adds sys.info and the registry listing.",
    {
      wake: z.boolean().optional().describe("Call plugin editor.wake before probing"),
      wait: z
        .enum(["none", "compile_idle"])
        .optional()
        .describe("compile_idle polls sys.status until compilation finishes"),
      timeout_s: z.number().positive().optional().describe("Overall budget in seconds (default 30)"),
      verbose: z.boolean().optional().describe("Also fetch sys.info and include the registry list"),
      project: projectArg,
    },
    async (args, ctx, extra) => {
      const registry = ctx.pool.listRegistry().map((d) => ({
        projectPath: d.entry.projectPath,
        projectName: d.entry.projectName,
        port: d.entry.port,
        pid: d.entry.pid,
        unityVersion: d.entry.unityVersion,
        pluginVersion: d.entry.pluginVersion,
        alive: d.alive,
        ...(d.reason !== undefined ? { reason: d.reason } : {}),
      }));
      if (registry.filter((r) => r.alive).length === 0) {
        const unresponsive = registry.filter((r) => r.reason === "unresponsive").length;
        // F-9: health is the FIRST tool the instructions send people to, so
        // it must name the blocking dialog too - probe the blocked editor
        // live (transport thread answers while main is stuck).
        let probed: Record<string, unknown> = {};
        const blockedEntry = ctx.pool
          .listRegistry()
          .find((d) => d.reason === "unresponsive")?.entry;
        if (blockedEntry !== undefined) {
          const answer = await probeBlockedEditor(blockedEntry);
          if (answer !== null) {
            probed = {
              modal: answer.modal,
              modalCount: answer.modalCount,
              ...(answer.lastTickAgoMs !== undefined
                ? { lastTickAgoMs: answer.lastTickAgoMs }
                : {}),
              probedLive: true,
            };
          }
        }
        // Vocabulary alignment with the resolve path (F-12 follow-up): an
        // editor that exists but is blocked reports status "unresponsive",
        // "no_unity" is reserved for genuinely absent editors.
        return ok({
          status: unresponsive > 0 ? "unresponsive" : "no_unity",
          server: serverIdentity(),
          detail:
            unresponsive > 0
              ? `no responsive Unity Editor: ${unresponsive} registry entry/entries have a live pid ` +
                "but a stalled heartbeat (blocked main thread - modal dialog, long import, sleep - " +
                "or a hung editor). The process is likely still listening on its port; retry once " +
                "the editor unblocks." +
                (typeof probed.modalCount === "number"
                  ? probed.modalCount > 0
                    ? " A native dialog is up - see `modal`."
                    : " Live probe: no native dialog is up (long import/compile, not an unclicked dialog)."
                  : "")
              : "no running Unity Editor with the UnityMCP plugin was discovered",
          ...probed,
          registryDir: ctx.cfg.registryDir,
          registry,
        });
      }

      let resolved;
      try {
        resolved = ctx.pool.resolve(args.project);
      } catch (err) {
        // F-9: health wraps errors in ok() and so bypassed the fail() funnel
        // where the F-12 enrichment lives - enrich here too.
        const obj = await enrichBusyModal(ctx.cfg, toUnityMcpError(err).obj);
        const status =
          obj.code === "PROJECT_AMBIGUOUS"
            ? "ambiguous"
            : obj.code === "BUSY_MODAL"
              ? "unresponsive"
              : "not_found";
        return ok({ status, server: serverIdentity(), error: obj, registry });
      }
      const { client, entry } = resolved;

      const budgetMs = Math.floor((args.timeout_s ?? 30) * 1000);
      const deadline = Date.now() + budgetMs;

      let wake: string | undefined;
      if (args.wake === true) {
        try {
          await client.call("editor.wake", {}, {
            timeoutMs: LIGHT_CALL_TIMEOUT_MS,
            signal: extra.signal,
          });
          wake = "ok";
        } catch (err) {
          wake = isCode(err, "METHOD_NOT_FOUND")
            ? "unsupported"
            : `error: ${toUnityMcpError(err).message}`;
        }
      }

      let status = (await client.call("sys.status", {}, {
        timeoutMs: budgetMs,
        signal: extra.signal,
      })) as Record<string, unknown> | null;

      let waitedForCompile = false;
      if (args.wait === "compile_idle") {
        while (
          status !== null &&
          typeof status === "object" &&
          status.compiling === true &&
          Date.now() < deadline
        ) {
          waitedForCompile = true;
          await sleep(Math.min(500, Math.max(50, deadline - Date.now())));
          status = (await client.call("sys.status", {}, {
            timeoutMs: Math.max(1000, deadline - Date.now()),
            signal: extra.signal,
          })) as Record<string, unknown> | null;
        }
      }
      const stillCompiling =
        status !== null && typeof status === "object" && status.compiling === true;

      // F-21: sys.status answers on the transport thread (no main-thread hop),
      // so a frozen editor still returns it and the old "ok" fast path never
      // consulted the evidence it was already carrying. Derive the verdict
      // from lastTickAgoMs with the same threshold as the plugin's
      // BUSY_MODAL watchdog (Dispatcher.BusyModalThresholdMs = 3000) - in
      // 2.3.5 the same freeze surfaced as BUSY_MODAL; the connected-client
      // path had reintroduced "ok" as a regression.
      const lastTickAgoMs =
        status !== null && typeof status === "object" && typeof status.lastTickAgoMs === "number"
          ? status.lastTickAgoMs
          : null;
      const frozen = lastTickAgoMs !== null && lastTickAgoMs > UNRESPONSIVE_TICK_MS;

      const welcome = client.getWelcome();
      const out: Record<string, unknown> = {
        status: frozen
          ? "unresponsive"
          : args.wait === "compile_idle" && stillCompiling
            ? "compiling"
            : "ok",
        ...(frozen
          ? {
              detail:
                `editor main thread has not ticked for ${lastTickAgoMs} ms ` +
                `(> ${UNRESPONSIVE_TICK_MS} ms BUSY_MODAL threshold). The transport ` +
                "thread still answers; main-thread tools will return BUSY_MODAL. " +
                "Retry once the editor unblocks (modal dialog, long import, sleep).",
            }
          : {}),
        ...(frozen
          ? await (async () => {
              // F-9: name the blocker while we are already connected -
              // sys.modal answers on the transport thread (2.6.4 plugin;
              // older plugins answer METHOD_NOT_FOUND and we stay silent).
              try {
                const m = (await client.call("sys.modal", {}, {
                  timeoutMs: LIGHT_CALL_TIMEOUT_MS,
                  signal: extra.signal,
                })) as Record<string, unknown> | null;
                return m !== null && typeof m === "object"
                  ? { modal: m.modal ?? null, modalCount: m.modalCount ?? 0, probedLive: true }
                  : {};
              } catch {
                return {};
              }
            })()
          : {}),
        server: serverIdentity(),
        connectionState: client.getState(),
        project: {
          projectPath: entry.projectPath,
          projectName: entry.projectName,
          port: entry.port,
          unityVersion: entry.unityVersion,
          pluginVersion: entry.pluginVersion,
        },
        ...(welcome !== null
          ? {
              editor: welcome.editor,
              evalEngine: welcome.eval.engine,
              features: welcome.features,
            }
          : {}),
        sysStatus: status,
        ...(wake !== undefined ? { wake } : {}),
        ...(waitedForCompile ? { waitedForCompile } : {}),
      };
      if (args.verbose === true) {
        out.sysInfo = await client.call("sys.info", {}, {
          timeoutMs: Math.max(1000, deadline - Date.now()),
          signal: extra.signal,
        });
        out.registry = registry;
      }
      return ok(out);
    },
  ),

  tool(
    "get_editor_state",
    "Snapshot editor state (state.get): summary, hierarchy, selection, " +
      "project info and packages, size-capped by max_bytes.",
    {
      sections: z
        .array(z.enum(["summary", "hierarchy", "selection", "project", "packages"]))
        .optional()
        .describe("Sections to include; omit for the plugin default set"),
      max_bytes: z.number().int().positive().default(30_000).describe("Response size cap"),
      hierarchy_depth: z.number().int().positive().optional().describe("Max hierarchy depth"),
      project: projectArg,
    },
    async (args, ctx, extra) => {
      const { client } = ctx.pool.resolve(args.project);
      const result = await client.call(
        "state.get",
        {
          ...(args.sections !== undefined ? { sections: args.sections } : {}),
          maxBytes: args.max_bytes,
          ...(args.hierarchy_depth !== undefined ? { hierarchyDepth: args.hierarchy_depth } : {}),
        },
        { timeoutMs: QUERY_CALL_TIMEOUT_MS, signal: extra.signal },
      );
      return ok(result);
    },
  ),

  tool(
    "scene_query",
    "Query scene objects (scene.query). query matches names by substring, " +
      "supports * / ? wildcards ('Ruin*') and the t:ComponentType syntax; " +
      "leave it empty when filtering only by type/under. type accepts a " +
      "component's short or full name. At least one of query/type/under is " +
      "required.",
    {
      query: z
        .string()
        .default("")
        .describe(
          "Name substring, wildcard pattern (Ruin*), or t:ComponentType; empty when using type/under",
        ),
      type: z.string().optional().describe("Component type filter (short or full type name)"),
      under: z.string().optional().describe("Restrict to a hierarchy subtree path"),
      limit: z.number().int().positive().default(50).describe("Max results"),
      project: projectArg,
    },
    async (args, ctx, extra) => {
      const { client } = ctx.pool.resolve(args.project);
      const result = await client.call(
        "scene.query",
        {
          query: args.query,
          ...(args.type !== undefined ? { type: args.type } : {}),
          ...(args.under !== undefined ? { under: args.under } : {}),
          limit: args.limit,
        },
        { timeoutMs: QUERY_CALL_TIMEOUT_MS, signal: extra.signal },
      );
      return ok(result);
    },
  ),

  tool(
    "camera_capture",
    "Capture a PNG from the scene view, game view or a named camera " +
      "(camera.capture). Returns the local PNG path.",
    {
      view: z.enum(["scene", "game", "camera"]).default("scene"),
      target: z.string().optional().describe("Camera object name/path when view=camera"),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      output_path: z.string().optional().describe("Where to write the PNG"),
      focus_target: z.string().optional().describe("Object to frame before capturing"),
      project: projectArg,
    },
    async (args, ctx, extra) => {
      const { client } = ctx.pool.resolve(args.project);
      const result = await client.call(
        "camera.capture",
        {
          view: args.view,
          ...(args.target !== undefined ? { target: args.target } : {}),
          ...(args.width !== undefined ? { width: args.width } : {}),
          ...(args.height !== undefined ? { height: args.height } : {}),
          ...(args.output_path !== undefined ? { outputPath: args.output_path } : {}),
          ...(args.focus_target !== undefined ? { focusTarget: args.focus_target } : {}),
        },
        { timeoutMs: CAPTURE_CALL_TIMEOUT_MS, signal: extra.signal },
      );
      // Surface the PNG path as plain text content first for easy consumption.
      if (typeof result === "object" && result !== null) {
        const o = result as Record<string, unknown>;
        const pngPath = [o.path, o.outputPath, o.file].find(
          (v): v is string => typeof v === "string" && v.length > 0,
        );
        if (pngPath !== undefined) {
          return {
            content: [
              { type: "text", text: pngPath },
              { type: "text", text: JSON.stringify(result, null, 2) },
            ],
          };
        }
      }
      return ok(result);
    },
  ),

  tool(
    "ndmf_bake_run",
    "Run an NDMF avatar bake as a background job (job.submit ndmf.bake + " +
      "job.wait) with progress. Without output_dir the baked prefab lands in " +
      "Assets/UnityMCP_Bakes/<avatar>_<timestamp>/ and is left in the project " +
      "- clean it up when it was only a validation run. On wait timeout the " +
      "job keeps running and the jobId is reported for job_status.",
    {
      avatar: z.string().describe("Avatar object path or asset path to bake"),
      output_dir: z.string().optional().describe("Directory for baked output"),
      timeout_ms: z.number().int().positive().default(600_000),
      project: projectArg,
    },
    async (args, ctx, extra) => {
      const { client } = ctx.pool.resolve(args.project);
      const bridge = makeProgressBridge(extra);
      try {
        return await runJob(
          client,
          "ndmf.bake",
          {
            avatarPath: args.avatar,
            ...(args.output_dir !== undefined ? { outputDir: args.output_dir } : {}),
          },
          args.timeout_ms,
          bridge,
          extra.signal,
        );
      } finally {
        bridge.done();
      }
    },
  ),

  tool(
    "vrc_upload",
    "Upload an avatar or world to VRChat as a background job (job.submit " +
      "vrc.upload + job.wait) with progress. dry_run validates without " +
      "uploading (world checks: SceneDescriptor, PipelineManager/blueprintId, " +
      "AudioListeners, spawns, ReferenceCamera, RespawnHeightY, script compile " +
      "state, BuildTarget, ColorSpace, thumbnail; NOT lightmaps/layers/shader " +
      "scans). Omitting dry_run (or dry_run:false) selects the REAL path. " +
      "A REAL upload PUBLISHES content and therefore " +
      "requires BOTH confirm:true (ask the user for fresh approval of THIS " +
      "upload before setting it; a general request to work on the avatar is " +
      "not that approval) AND a human-created one-shot arm file " +
      "(tools\\arm-vrc-upload.bat, TTL 30 min) " +
      "- never create the arm file yourself. On wait timeout the job keeps " +
      "running and the jobId is reported for job_status.",
    {
      target: z.enum(["avatar", "world"]),
      object_name: z.string().optional().describe("Scene object or asset to upload"),
      blueprint_id: z.string().optional(),
      thumbnail_path: z.string().optional(),
      dry_run: z.boolean().default(false),
      confirm: z
        .boolean()
        .default(false)
        .describe("Required true for a real upload (publishes to VRChat); not needed for dry_run"),
      timeout_ms: z.number().int().positive().default(1_200_000),
      project: projectArg,
    },
    async (args, ctx, extra) => {
      // Server-side gate too (defense in depth with the plugin-side check):
      // never even submit an unconfirmed real upload job.
      if (!args.dry_run && !args.confirm) {
        const message =
          "A real vrc_upload publishes content to VRChat. " +
          "Re-run with confirm:true after the user has explicitly approved, " +
          "or use dry_run:true to validate without publishing.";
        // F-17: same server identity block as fail() responses.
        return {
          content: [
            { type: "text" as const, text: `[CONFIRM_REQUIRED] ${message}` },
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: { code: "CONFIRM_REQUIRED", message, retryable: false },
                  server: serverIdentity(),
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
      // Second, independent gate: confirm proves caller intent, the arm file
      // proves *operator* intent (one-shot, human-created, TTL-bound).
      if (!args.dry_run) {
        const arm = checkArm(ctx.cfg);
        if (!arm.armed) return armRequiredResult(arm);
        // L-3: consume is an atomic claim now - if a concurrent call won the
        // race between our check and here, this attempt is NOT armed.
        if (!consumeArm(arm.file)) {
          return armRequiredResult({
            armed: false,
            file: arm.file,
            detail: "arm was consumed by a concurrent attempt",
          });
        }
      }
      const { client } = ctx.pool.resolve(args.project);
      const bridge = makeProgressBridge(extra);
      try {
        return await runJob(
          client,
          "vrc.upload",
          {
            target: args.target,
            ...(args.object_name !== undefined ? { objectName: args.object_name } : {}),
            ...(args.blueprint_id !== undefined ? { blueprintId: args.blueprint_id } : {}),
            ...(args.thumbnail_path !== undefined ? { thumbnailPath: args.thumbnail_path } : {}),
            dryRun: args.dry_run,
            confirm: args.confirm,
          },
          args.timeout_ms,
          bridge,
          extra.signal,
        );
      } finally {
        bridge.done();
      }
    },
  ),

  tool(
    "vrc_avatar_audit",
    "Audit a VRChat avatar (vrc.avatarAudit): performance rank, missing " +
      "components, common upload blockers. checks narrows the audit set.",
    {
      avatar: z.string().optional().describe("Avatar object path; omit for the scene default"),
      checks: z.array(z.string()).optional().describe("Subset of audit check names"),
      project: projectArg,
    },
    async (args, ctx, extra) => {
      const { client } = ctx.pool.resolve(args.project);
      const result = await client.call(
        "vrc.avatarAudit",
        {
          ...(args.avatar !== undefined ? { avatar: args.avatar } : {}),
          ...(args.checks !== undefined ? { checks: args.checks } : {}),
        },
        { timeoutMs: AUDIT_CALL_TIMEOUT_MS, signal: extra.signal },
      );
      return ok(result);
    },
  ),

  tool(
    "find_recipe",
    "Search the server-local Unity recipe library (no Unity call). Exact name " +
      "match returns that recipe's full markdown; otherwise ranked keyword " +
      "matches. Recipes are also exposed as recipe://<category>/<name> resources.",
    {
      query: z.string().describe("Recipe name or keywords"),
      tags: z.array(z.string()).optional().describe("Require all of these tags"),
      top_n: z.number().int().positive().max(20).default(3),
      names_only: z.boolean().default(false).describe("Return only the ranked list, no bodies"),
    },
    async (args, ctx) => {
      const lib = ctx.recipes;
      if (!lib.available) {
        return ok({ available: false, message: lib.unavailableMessage() });
      }
      const res = lib.search(args.query, {
        ...(args.tags !== undefined ? { tags: args.tags } : {}),
        topN: args.top_n,
      });
      if (res.exact) {
        const hit = res.hits[0];
        if (hit) return okText(lib.readBody(hit.entry));
      }
      if (args.names_only) {
        return ok({
          totalMatches: res.totalMatches,
          results: res.hits.map((h) => ({
            name: h.entry.name,
            category: h.entry.category,
            tags: h.entry.tags,
            description: h.entry.description,
            score: h.score,
          })),
        });
      }
      return ok({
        totalMatches: res.totalMatches,
        results: res.hits.map((h) => ({
          name: h.entry.name,
          category: h.entry.category,
          tags: h.entry.tags,
          description: h.entry.description,
          score: h.score,
          body: lib.readBody(h.entry),
        })),
      });
    },
  ),

  tool(
    "get_logs",
    "Query Unity console logs. Served from the server-side ring buffer of log " +
      "events; falls back to the plugin logs.get when the buffer is empty. " +
      "clear=true clears both sides. Ring entries have two id spaces: 'id' is " +
      "the server-ring id (use for since_id), 'pluginId' matches the ids in " +
      "eval-response logs[] (plugin ids reset on domain reload).",
    {
      level: z
        .enum(["debug", "info", "warning", "error"])
        .optional()
        .describe("Minimum severity"),
      regex: z.string().optional().describe("Case-insensitive regex over message/stack"),
      count: z.number().int().positive().max(2000).optional().describe("Max entries (default 100)"),
      since_id: z.number().int().nonnegative().optional().describe("Only entries newer than this id"),
      clear: z.boolean().optional().describe("Clear logs instead of querying"),
      project: projectArg,
    },
    async (args, ctx, extra) => {
      const { client, logs } = ctx.pool.resolve(args.project);

      if (args.clear === true) {
        let pluginCleared = false;
        let pluginError: string | undefined;
        try {
          await client.call("logs.clear", {}, {
            timeoutMs: LIGHT_CALL_TIMEOUT_MS,
            signal: extra.signal,
          });
          pluginCleared = true;
        } catch (err) {
          if (!isCode(err, "METHOD_NOT_FOUND")) {
            pluginError = toUnityMcpError(err).message;
          }
        }
        logs.clear();
        return ok({
          cleared: true,
          pluginCleared,
          ...(pluginError !== undefined ? { pluginError } : {}),
        });
      }

      const query = {
        ...(args.level !== undefined ? { level: args.level } : {}),
        ...(args.regex !== undefined ? { regex: args.regex } : {}),
        ...(args.count !== undefined ? { count: args.count } : {}),
        ...(args.since_id !== undefined ? { sinceId: args.since_id } : {}),
      };
      if (logs.totalPushed > 0) {
        return ok({ source: "ring", lastId: logs.lastId, entries: logs.query(query) });
      }
      // Ring is empty (e.g. just connected): ask the plugin, tolerate absence.
      try {
        const remote = await client.call("logs.get", query, {
          timeoutMs: LIGHT_CALL_TIMEOUT_MS,
          signal: extra.signal,
        });
        return ok({ source: "plugin", result: remote });
      } catch (err) {
        if (isCode(err, "METHOD_NOT_FOUND")) {
          return ok({ source: "ring", lastId: logs.lastId, entries: [] });
        }
        throw err;
      }
    },
  ),

  tool(
    "session_lease",
    "Manage the editor write lease (lease.acquire/release/status/takeover). " +
      "Lease identity is always THIS server session (the plugin liveness-checks " +
      "it for disconnected-holder steal), so there is no client id parameter. " +
      "ttl_s customizes the TTL per acquire/takeover (5-3600 s, plugin default 120 s).",
    {
      action: z.enum(["acquire", "release", "status", "takeover"]),
      ttl_s: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Lease TTL in seconds for acquire/takeover (clamped to 5-3600; default 120)"),
      project: projectArg,
    },
    async (args, ctx, extra) => {
      const { client } = ctx.pool.resolve(args.project);
      const params = {
        clientId: client.sessionId,
        ...(args.ttl_s !== undefined ? { ttlMs: args.ttl_s * 1000 } : {}),
      };
      const result = await client.call(`lease.${args.action}`, params, {
        timeoutMs: LIGHT_CALL_TIMEOUT_MS,
        signal: extra.signal,
      });
      return ok(result);
    },
  ),

  tool(
    "job_status",
    "Fetch one job record by id, or all jobs when job_id is omitted " +
      "(job.status). The all-jobs listing is summarized (no result/logs " +
      "payloads) unless include_details:true.",
    {
      job_id: z.string().optional(),
      include_details: z
        .boolean()
        .default(false)
        .describe("All-jobs listing only: include full result/logs payloads"),
      project: projectArg,
    },
    async (args, ctx, extra) => {
      const { client } = ctx.pool.resolve(args.project);
      const result = await client.call(
        "job.status",
        args.job_id !== undefined ? { jobId: args.job_id } : {},
        { timeoutMs: LIGHT_CALL_TIMEOUT_MS, signal: extra.signal },
      );
      if (args.job_id === undefined && args.include_details !== true) {
        return ok(summarizeJobList(result));
      }
      return ok(result);
    },
  ),

  tool(
    "job_cancel",
    "Cancel a running background job (job.cancel).",
    {
      job_id: z.string(),
      project: projectArg,
    },
    async (args, ctx, extra) => {
      const { client } = ctx.pool.resolve(args.project);
      const result = await client.call(
        "job.cancel",
        { jobId: args.job_id },
        { timeoutMs: LIGHT_CALL_TIMEOUT_MS, signal: extra.signal },
      );
      return ok(result);
    },
  ),

  // ---- VCC / VPM layer (v2.4.0) - works with NO Unity Editor running ------

  tool(
    "vcc_project",
    "Inspect VRChat Creator Companion projects WITHOUT needing a running " +
      "Unity Editor. action:'list' enumerates the projects VCC knows about " +
      "(existence, Unity version, VPM manifest presence); action:'info' " +
      "reads one project's locked VPM packages and flags legacy Assets-era " +
      "folders. Read-only, no external tools required.",
    {
      action: z.string().describe("list = all VCC projects; info = one project's detail"),
      project_path: z
        .string()
        .optional()
        .describe("info only: full path to the Unity project directory"),
    },
    async (args) => {
      if (args.action !== "list" && args.action !== "info") {
        return fail(
          new UnityMcpError({
            code: "INVALID_PARAMS",
            message: `vcc_project: unknown action '${args.action}' (list|info)`,
            retryable: false,
          }),
        );
      }
      if (args.action === "list") {
        return ok(listProjects());
      }
      if (!args.project_path) {
        return fail(
          new UnityMcpError({
            code: "INVALID_PARAMS",
            message: "vcc_project info: 'project_path' is required",
            retryable: false,
          }),
        );
      }
      return ok(projectInfo(args.project_path));
    },
  ),

  tool(
    "vpm_manage",
    "Manage a VRChat project's packages - and create new projects - via the " +
      "vrc-get CLI (no Unity Editor needed). Actions: repos (list " +
      "repositories), search (find a package), outdated (JSON, per project), " +
      "add / remove / resolve / upgrade (modify the project - close or reload " +
      "the Unity project afterwards; upgrade with no package updates " +
      "everything, and its output can contain conflict warnings that -y " +
      "auto-accepted - always read it), update_repos (refresh repo cache), " +
      "create (copy a VCC template - avatar/world/base - to a NEW directory, " +
      "resolve its packages, add any 'packages' extras and register it in " +
      "VCC; never overwrites). After a package write the derived caches " +
      "Library/Bee and Library/ScriptAssemblies are deleted (clean_library, " +
      "default true; skipped while that project's editor is open) - stale " +
      "ones put the next start into Safe Mode. Requires vrc-get on PATH; " +
      "without it this tool fails with install instructions while " +
      "vcc_project keeps working. Package changes are git-recoverable but " +
      "always tell the user what you are about to install, remove or create.",
    {
      action: z
        .string()
        .describe(
          "One of: repos | search | outdated | add | remove | resolve | upgrade | update_repos | create",
        ),
      project: z
        .string()
        .optional()
        .describe(
          "Project directory path (required for outdated/add/remove/resolve; " +
            "for create = the NEW directory to make)",
        ),
      package: z
        .string()
        .optional()
        .describe("Package id for add/remove, or the search query for search"),
      version: z.string().optional().describe("add/upgrade: explicit version (with 'package')"),
      clean_library: z
        .boolean()
        .optional()
        .describe(
          "After add/remove/resolve/upgrade: delete the project's derived " +
            "Library/Bee and Library/ScriptAssemblies caches (default true; " +
            "never runs while that project's editor is open)",
        ),
      template: z
        .string()
        .optional()
        .describe("create only: VCC template name (avatar | world | base | ...), default avatar"),
      packages: z
        .array(z.string())
        .optional()
        .describe("create only: extra package ids to add after the template resolve"),
      register: z
        .boolean()
        .optional()
        .describe("create only: register the project in VCC's list (default true)"),
      timeout_ms: z.number().int().positive().default(120_000),
    },
    async (args) => {
      if (args.action === "create") {
        return vpmCreate(args);
      }
      // An injected runner (tests) does not spawn vrc-get - only the real
      // default runner needs the CLI on PATH. (Surfaced by CI's first Linux
      // run: the Windows dev machines all had vrc-get.exe installed.)
      if (vpmRunner === defaultRunner && findVrcGet() === null) {
        const message = VRC_GET_INSTALL_HINT;
        return {
          content: [
            { type: "text" as const, text: `[VRC_GET_NOT_FOUND] ${message}` },
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: { code: "VRC_GET_NOT_FOUND", message, retryable: false },
                  server: serverIdentity(),
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
      let spec;
      try {
        // action is validated here (not in the zod enum) so unknown values
        // still get the {error, server} block - SDK schema rejections carry
        // no server identity (F-24).
        spec = vpmActionSpec(args.action, {
          project: args.project,
          package: args.package,
          version: args.version,
        });
      } catch (err) {
        return fail(
          new UnityMcpError({
            code: "INVALID_PARAMS",
            message: (err as Error).message,
            retryable: false,
          }),
        );
      }
      let run;
      try {
        run = await vpmRunner(spec.args, args.timeout_ms);
      } catch (err) {
        if (err instanceof VrcGetTimeoutError) {
          // F-23: a timeout kill is the canonical retryable condition -
          // don't let it decay into a generic HANDLER_EXCEPTION.
          return fail(
            new UnityMcpError({
              code: "VRC_GET_FAILED",
              message: err.message,
              retryable: true,
              detail: {
                command: `vrc-get ${spec.args.join(" ")}`,
                timeoutMs: err.timeoutMs,
                hint: "raise timeout_ms and retry; the filesystem state after a mid-write kill is vrc-get's concern - run action:'resolve' to reconcile",
              },
            }),
          );
        }
        throw err;
      }
      const body: Record<string, unknown> = {
        command: `vrc-get ${spec.args.join(" ")}`,
        exitCode: run.code,
      };
      if (spec.json && run.code === 0) {
        try {
          body.result = JSON.parse(run.stdout);
        } catch {
          body.output = run.stdout.slice(0, 64 * 1024);
        }
      } else {
        body.output = run.stdout.slice(0, 64 * 1024);
      }
      if (run.stderr.trim().length > 0) {
        // F-28: on success this is subprocess warning chatter (often
        // OS-localized), not a failure signal - name it accordingly.
        if (run.code === 0) body.warnings = run.stderr.slice(0, 16 * 1024);
        else body.stderr = run.stderr.slice(0, 16 * 1024);
      }
      if (run.code !== 0) {
        // F-22: vrc-get answers "nothing to do" with exit 1 for benign
        // no-ops (already installed / nothing to resolve). That is a
        // success-equivalent, not a failure an agent should retry.
        if (/nothing to do/i.test(run.stderr)) {
          body.noop = true;
          body.exitCode = 0;
          return ok(body);
        }
        return fail(
          new UnityMcpError({
            code: "VRC_GET_FAILED",
            message: `vrc-get exited ${run.code} for '${args.action}'`,
            retryable: false,
            detail: body,
          }),
        );
      }
      if (
        spec.write &&
        args.project !== undefined &&
        ["add", "remove", "resolve", "upgrade"].includes(args.action)
      ) {
        if (args.clean_library === false) {
          // nit (2.6.3): say WHY nothing was cleaned - a silently absent key
          // left no trace of whether the skip was requested or a bug.
          body.libraryClean = { skipped: true, reason: "clean_library:false requested" };
          return ok(body);
        }
        // P1-2: stale Bee/ScriptAssemblies after a package change put the
        // NEXT editor start into Safe Mode ("Unable to resolve reference").
        // Derived caches only, and never under a live editor.
        const editor = editorOpenOn(args.project);
        if (editor.open) {
          // F-1: name the evidence. source "lockfile" = the plugin never
          // registered (Safe Mode / compile failure) - exactly the editor the
          // registry-only check used to miss while Bee got deleted under it.
          const who =
            editor.source === "lockfile"
              ? "Unity has this project open (Temp/UnityLockfile present; not in the MCP registry - Safe Mode or a failed plugin compile). If no editor is actually running, the lockfile may be stale from a crash"
              : `Unity (pid ${editor.pid}) has this project open`;
          body.libraryClean = {
            skipped: true,
            reason:
              `${who} - the stale-cache risk applies to the ` +
              "NEXT start; close the editor and clean then, or pass clean_library:false to silence this",
          };
        } else {
          try {
            body.libraryClean = cleanDerivedLibrary(args.project);
          } catch (err) {
            body.libraryClean = { skipped: true, reason: (err as Error).message };
          }
        }
      }
      return ok(body);
    },
  ),

  tool(
    "unity_editor",
    "Unity Editor process lifecycle for a project - needs no running editor " +
      "(editorless layer). Open-detection is two-stage: the MCP discovery " +
      "registry, then Temp/UnityLockfile (Unity's own lock - catches Safe-" +
      "Mode/compile-failure editors the registry misses). Actions: status " +
      "(discovery-registry view of known editors with pid liveness), launch " +
      "(resolves Unity.exe via editor_path > VCC settings > Unity Hub path, " +
      "refuses when that project is already open, spawns detached with " +
      "-projectPath - never -openfile, which hangs Unity - and by default " +
      "waits until the bridge registers), quit (graceful close first; an " +
      "unsaved-scene dialog can keep the editor alive - BUSY_MODAL will " +
      "name it - then force:true for a hard kill, which can corrupt " +
      "Library; unregistered editors are found by OS process scan).",
    {
      action: z.string().describe("One of: status | launch | quit"),
      project: z
        .string()
        .optional()
        .describe("Project directory path (launch/quit: required; status: optional filter)"),
      editor_path: z.string().optional().describe("launch: explicit Unity.exe path override"),
      wait_ready: z
        .boolean()
        .optional()
        .describe("launch: wait until the plugin registers in discovery (default true)"),
      timeout_ms: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("launch ready-wait / quit grace budget in ms (defaults 180000 / 15000)"),
      force: z
        .boolean()
        .optional()
        .describe("quit: hard-kill when graceful close does not exit in time (default false)"),
    },
    async (args) => {
      const norm = (p: string): string => p.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
      if (args.action === "status") {
        let editors = readEditorRegistry();
        if (args.project !== undefined) {
          const want = norm(args.project);
          editors = editors.filter((e) => norm(e.projectPath) === want);
        }
        return ok({ editors });
      }
      if (args.action === "launch") {
        if (args.project === undefined) {
          return fail(
            new UnityMcpError({
              code: "INVALID_PARAMS",
              message: "unity_editor launch: 'project' is required",
              retryable: false,
            }),
          );
        }
        const already = editorOpenOn(args.project);
        if (already.open) {
          return ok({
            launched: false,
            alreadyRunning: true,
            pid: already.pid ?? findUnityPidByProject(args.project),
            source: already.source,
            note:
              already.source === "lockfile"
                ? "Temp/UnityLockfile is present - an unregistered editor (Safe Mode / plugin compile failure) or a crashed editor's stale lock holds this project; a second instance would fail on the project lock. If no Unity is actually running, delete Temp/UnityLockfile and retry"
                : "an editor already has this project open - a second instance would fail on the project lock",
          });
        }
        const resolved = resolveUnityExe(args.project, args.editor_path);
        if (resolved.exe === null) {
          return fail(
            new UnityMcpError({
              code: "INVALID_PARAMS",
              message:
                `unity_editor launch: no Unity.exe found for this project (m_EditorVersion=${resolved.version ?? "unknown"}). ` +
                "Tried editor_path, VCC settings unityEditors and the Unity Hub install path - pass editor_path explicitly.",
              retryable: false,
            }),
          );
        }
        const spawned = launchUnity(args.project, resolved.exe);
        const body: Record<string, unknown> = {
          launched: true,
          pid: spawned.pid,
          exe: resolved.exe,
          exeSource: resolved.source,
          editorVersion: resolved.version,
        };
        if (args.wait_ready !== false) {
          const deadline = Date.now() + (args.timeout_ms ?? 180_000);
          let ready = false;
          while (Date.now() < deadline) {
            const state = editorOpenOn(args.project);
            // "ready" means the BRIDGE registered - the lockfile appears
            // seconds after spawn, long before the plugin loads, and must
            // not satisfy this wait.
            if (state.open && state.source === "registry") {
              ready = true;
              body.bridgePid = state.pid;
              break;
            }
            await sleep(2_000);
          }
          body.ready = ready;
          if (!ready) {
            // F-15: BUSY_MODAL needs the plugin, and the plugin is exactly what
            // has not loaded yet - so ask the OS which dialog is holding it.
            const dialogs = describeNativeDialogs(spawned.pid);
            if (dialogs.length > 0) {
              body.blockingDialogs = dialogs;
              const d = dialogs[0];
              body.hint =
                `editor startup is blocked by a dialog: "${d?.title ?? ""}"` +
                (d?.buttons.length ? ` [${d.buttons.join(", ")}]` : "") +
                " - a human must answer it in the editor UI; the MCP bridge cannot register until then" +
                (dialogs.length > 1 ? ` (+${dialogs.length - 1} more dialog(s))` : "");
            } else {
              body.hint =
                "editor process started but the bridge has not registered yet - no native dialog is " +
                "up, so this is a long import/compile or a hung editor; unity_health_check will say " +
                "more once the plugin registers";
            }
          }
        }
        return ok(body);
      }
      if (args.action === "quit") {
        if (args.project === undefined) {
          return fail(
            new UnityMcpError({
              code: "INVALID_PARAMS",
              message: "unity_editor quit: 'project' is required",
              retryable: false,
            }),
          );
        }
        const state = editorOpenOn(args.project);
        if (!state.open) {
          return ok({
            closed: false,
            running: false,
            note: "no editor holds this project (registry and Temp/UnityLockfile both clear - nothing to quit)",
          });
        }
        let pid = state.pid;
        let pidSource: "registry" | "os-scan" = "registry";
        if (pid === undefined) {
          // F-1: lockfile says open but the plugin never registered (Safe
          // Mode / compile failure) - the old registry-only path no-opped
          // here, in exactly the state quit exists for. Find the editor at
          // the OS level instead.
          pid = findUnityPidByProject(args.project);
          pidSource = "os-scan";
          if (pid === undefined) {
            return ok({
              closed: false,
              running: false,
              lockfilePresent: true,
              note:
                "Temp/UnityLockfile is present but no Unity process matching this project was found - " +
                "stale lockfile after a crash (delete it if you are sure no editor is open), or an " +
                "editor this scan cannot see. Nothing was quit.",
            });
          }
        }
        if (pidSource === "registry" && !isUnityPid(pid)) {
          // M-3 (kimi audit): stale registry entry + OS pid reuse could point
          // taskkill at an innocent process. os-scan pids are Unity-only by
          // construction; registry pids get verified here.
          return ok({
            closed: false,
            running: false,
            note:
              `registry pid ${pid} is not a Unity.exe process (stale entry after a crash + ` +
              "pid reuse?) - nothing was killed. The dead-entry sweep clears this on the " +
              "next editor start.",
          });
        }
        const graceful = closeProcessGracefully(pid);
        const deadline = Date.now() + (args.timeout_ms ?? 15_000);
        while (Date.now() < deadline && pidAlive(pid)) {
          await sleep(1_000);
        }
        const scanNote =
          pidSource === "os-scan"
            ? "editor located by OS process scan (not in MCP discovery - Safe Mode or plugin compile failure?)"
            : undefined;
        if (!pidAlive(pid)) {
          return ok({
            closed: true,
            forced: false,
            pid,
            pidSource,
            ...(scanNote !== undefined ? { note: scanNote } : {}),
          });
        }
        if (args.force === true) {
          const killed = killProcess(pid);
          const hardDeadline = Date.now() + 5_000;
          while (Date.now() < hardDeadline && pidAlive(pid)) {
            await sleep(500);
          }
          return ok({
            closed: !pidAlive(pid),
            forced: true,
            pid,
            pidSource,
            note: "forced kill - if the editor was mid-write, clean Library/Bee before the next start",
            detail: killed.detail,
          });
        }
        return ok({
          closed: false,
          running: true,
          pid,
          pidSource,
          graceRequested: graceful.requested,
          hint:
            "still running after the grace window - a save/confirm dialog may be holding it " +
            "(unsaved scene). Handle the dialog in the editor, or rerun with force:true " +
            "(forced kill can corrupt Library)" +
            (scanNote !== undefined ? `. Note: ${scanNote}` : ""),
        });
      }
      return fail(
        new UnityMcpError({
          code: "INVALID_PARAMS",
          message: `unity_editor: unknown action '${args.action}' (status|launch|quit)`,
          retryable: false,
        }),
      );
    },
  ),

  tool(
    "asset_import",
    "Import a .unitypackage into the running Unity project as a first-class " +
      "operation (asset.importPackage) - the entry point for BOOTH assets. " +
      "Always non-interactive (no import dialog); answers with the list of " +
      "imported/changed asset paths. A package containing scripts triggers a " +
      "compile + domain reload: the call may then answer DOMAIN_RELOAD " +
      "(retryable) while the import itself completes - verify with " +
      "get_editor_state or vcc afterwards instead of importing again. " +
      "Existing assets at the same paths are overwritten. For FBX/texture " +
      "importer settings use the asset-import recipes " +
      "(fbx_import_settings_batch, texture_format_batch).",
    {
      path: z.string().describe("Absolute path to the .unitypackage file"),
      timeout_ms: z.number().int().positive().optional().describe("Per-call timeout in ms (default 300000 - imports are slow)"),
      project: projectArg,
    },
    async (args, ctx, extra) => {
      const { client } = ctx.pool.resolve(args.project);
      const bridge = makeProgressBridge(extra);
      try {
        const result = await client.call(
          "asset.importPackage",
          { path: args.path },
          {
            timeoutMs: args.timeout_ms ?? 300_000,
            onProgress: bridge.onProgress,
            signal: extra.signal,
          },
        );
        return ok(result);
      } finally {
        bridge.done();
      }
    },
  ),

  tool(
    "vrc_menu",
    "Expression-menu inspection for the avatar (needs the VRChat Avatars " +
      "SDK in the project). action:'tree' dumps the full menu hierarchy " +
      "(names, types, parameters, submenus, cycle-safe). action:'audit' " +
      "judges every control on three axes: parameter declared in " +
      "expressionParameters, parameter present in a source animator, and - " +
      "the axis that actually catches dead menu items - whether the " +
      "transforms animated by the layers using that parameter still exist " +
      "on the avatar. Judged on SOURCE controllers (post-bake AAO merges " +
      "false-positive); humanoid muscle curves and known internal dummies " +
      "are excluded. Read-only.",
    {
      action: z.string().describe("One of: tree | audit"),
      avatar: z
        .string()
        .optional()
        .describe("Avatar object name/path; default = first VRCAvatarDescriptor in loaded scenes"),
      timeout_ms: z.number().int().positive().optional().describe("Per-call timeout in ms"),
      project: projectArg,
    },
    async (args, ctx, extra) => {
      const { client } = ctx.pool.resolve(args.project);
      const method =
        args.action === "tree" ? "vrc.menuTree" : args.action === "audit" ? "vrc.menuAudit" : null;
      if (method === null) {
        return fail(
          new UnityMcpError({
            code: "INVALID_PARAMS",
            message: `vrc_menu: unknown action '${args.action}' (tree|audit)`,
            retryable: false,
          }),
        );
      }
      const result = await client.call(
        method,
        { ...(args.avatar !== undefined ? { avatar: args.avatar } : {}) },
        { timeoutMs: args.timeout_ms ?? AUDIT_CALL_TIMEOUT_MS, signal: extra.signal },
      );
      return ok(result);
    },
  ),
];

export function registerTools(server: McpServer, ctx: ToolContext): void {
  enrichCfgRef = ctx.cfg;
  for (const register of toolTable) register(server, ctx);
}
