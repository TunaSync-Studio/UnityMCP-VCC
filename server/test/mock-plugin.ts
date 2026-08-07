// Scriptable fake Unity plugin for tests: a net.Server speaking the full v2
// wire protocol (hello/welcome handshake, req->res with configurable delays,
// progress emission, cancel handling, bye+close reload simulation with rebind
// on the same port, registry entry JSON in a temp dir).

import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { FrameDecoder, encodeFrame } from "../src/transport/frame.js";
import {
  registryFileName,
  type CancelPayload,
  type Envelope,
  type EventKind,
  type HelloPayload,
  type ReqPayload,
  type ResPayload,
  type WelcomePayload,
  type ErrorObj,
} from "../src/protocol.js";

export interface MockHandlerContext {
  reqId: string;
  progress: (p: { pct?: number; message?: string; phase?: string }) => void;
  delay: (ms: number) => Promise<void>;
}

export type MockHandler = (params: unknown, ctx: MockHandlerContext) => unknown | Promise<unknown>;

/** Throw from a handler to make the mock res a specific protocol error code. */
export class MockPluginError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "MockPluginError";
  }
}

/** Per-job-method behavior for the mock's built-in job engine. */
export interface MockJobBehavior {
  /** Progress frames emitted on the job.wait req id before completion. */
  progressSteps?: number;
  stepDelayMs?: number;
  /** job.wait blocks for its wire timeoutMs then answers error TIMEOUT. */
  neverComplete?: boolean;
  /** Completed result override. */
  result?: unknown;
  /** Complete as a failed record carrying this error. */
  failWith?: ErrorObj;
}

interface MockJob {
  jobId: string;
  method: string;
  params: unknown;
  state: "pending" | "running" | "completed" | "failed" | "cancelled";
  storedResult?: unknown;
}

export interface MockPluginOptions {
  registryDir?: string;
  projectPath?: string;
  projectName?: string;
  port?: number;
  /** Registry pid; defaults to the (alive) test process pid. */
  pid?: number;
  versionMin?: number;
  versionMax?: number;
  /** false = never answer hello (client-side hello timeout tests). */
  autoWelcome?: boolean;
  /** When set, hello.client.token must match or AUTH_REQUIRED is returned. */
  requireToken?: string;
  /**
   * Token written into the registry entry. Defaults to requireToken; pass
   * null to omit the token from the registry (stale/foreign registry tests).
   */
  advertiseToken?: string | null;
  /**
   * true = ack cancels with found:false and let the original req complete
   * anyway, so tests can observe a genuine late res being tombstone-dropped.
   */
  ignoreCancel?: boolean;
  sessionId?: string;
  methodDelays?: Record<string, number>;
  handlers?: Record<string, MockHandler>;
  /** Behavior of the built-in job engine, keyed by submitted job method. */
  jobBehaviors?: Record<string, MockJobBehavior>;
}

interface InFlight {
  conn: net.Socket;
  cancelled: boolean;
}

interface MockConn {
  socket: net.Socket;
  decoder: FrameDecoder;
  helloSeen: boolean;
  protocolV: number;
}

export class MockPlugin {
  readonly projectPath: string;
  readonly projectName: string;
  private server: net.Server | null = null;
  private boundPort = 0;
  private readonly conns = new Set<MockConn>();
  private readonly inFlight = new Map<string, InFlight>();
  private domainReloadCount = 0;
  private sessionId: string;
  private connCount = 0;
  private stopped = false;
  private rebindTimer: NodeJS.Timeout | null = null;
  private readonly jobs = new Map<string, MockJob>();
  private jobSeq = 0;

  readonly received: {
    hellos: HelloPayload[];
    reqs: Array<{ id: string; method: string; params: unknown }>;
    cancels: CancelPayload[];
  } = { hellos: [], reqs: [], cancels: [] };

  constructor(private readonly opts: MockPluginOptions = {}) {
    this.projectPath = opts.projectPath ?? "C:/Test/MockProject";
    this.projectName = opts.projectName ?? "MockProject";
    this.sessionId = opts.sessionId ?? randomUUID();
  }

  get port(): number {
    return this.boundPort;
  }

  get connectionCount(): number {
    return this.connCount;
  }

  get liveConnections(): number {
    return this.conns.size;
  }

  async start(): Promise<number> {
    await this.bind(this.opts.port ?? 0);
    if (this.opts.registryDir !== undefined) this.writeRegistry();
    return this.boundPort;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.rebindTimer !== null) {
      clearTimeout(this.rebindTimer);
      this.rebindTimer = null;
    }
    for (const c of this.conns) c.socket.destroy();
    this.conns.clear();
    await this.closeListener();
    this.deleteRegistry();
  }

  /** Hard-close all live connections without bye (crash simulation). */
  dropConnections(): void {
    for (const c of this.conns) c.socket.destroy();
    this.conns.clear();
  }

  /**
   * Domain reload ritual: res DOMAIN_RELOAD for in-flight reqs, broadcast bye,
   * close sockets and listener, then rebind the SAME port after resumeMs.
   */
  async simulateReload(opts?: { resumeMs?: number; resumeHintMs?: number }): Promise<void> {
    const resumeMs = opts?.resumeMs ?? 300;
    for (const [id, flight] of this.inFlight) {
      flight.cancelled = true;
      this.writeTo(flight.conn, {
        id,
        type: "res",
        payload: {
          ok: false,
          error: { code: "DOMAIN_RELOAD", message: "domain reload", retryable: true },
        } satisfies ResPayload,
      });
    }
    this.inFlight.clear();
    const bye: Envelope = {
      id: randomUUID(),
      type: "bye",
      payload: { reason: "domain_reload", resumeHintMs: opts?.resumeHintMs ?? 3000 },
    };
    for (const c of this.conns) {
      this.writeTo(c.socket, bye);
      c.socket.end();
    }
    const closing = [...this.conns];
    this.conns.clear();
    await this.closeListener();
    // Give FIN packets a moment to land before the port is considered gone.
    await new Promise((r) => setTimeout(r, 20));
    for (const c of closing) c.socket.destroy();
    this.domainReloadCount += 1;
    this.rebindTimer = setTimeout(() => {
      this.rebindTimer = null;
      if (this.stopped) return;
      void this.bind(this.boundPort).then(() => {
        if (this.opts.registryDir !== undefined) this.writeRegistry();
      });
    }, resumeMs);
    this.rebindTimer.unref?.();
  }

  /** Change the enforced token at runtime (token rotation tests). */
  setRequireToken(token: string | undefined): void {
    if (token === undefined) {
      delete this.opts.requireToken;
    } else {
      this.opts.requireToken = token;
    }
  }

  /** Broadcast an uncorrelated event frame to every live connection. */
  sendEvent(kind: EventKind, data: unknown): void {
    const env: Envelope = { id: randomUUID(), type: "event", payload: { kind, data } };
    for (const c of this.conns) this.writeTo(c.socket, env);
  }

  /** Craft a res on the newest connection (late-res tombstone tests). */
  sendLateRes(reqId: string, result: unknown): void {
    const latest = [...this.conns].pop();
    if (!latest) throw new Error("no live connection to send late res on");
    this.writeTo(latest.socket, {
      id: reqId,
      type: "res",
      payload: { ok: true, result } satisfies ResPayload,
    });
  }

  writeRegistry(overrides?: Record<string, unknown>): string {
    const dir = this.opts.registryDir;
    if (dir === undefined) throw new Error("mock has no registryDir");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, registryFileName(this.projectPath));
    const advertised =
      this.opts.advertiseToken === null
        ? undefined
        : (this.opts.advertiseToken ?? this.opts.requireToken);
    const entry = {
      schemaVersion: 1,
      port: this.boundPort,
      projectPath: this.projectPath,
      projectName: this.projectName,
      pid: this.opts.pid ?? process.pid,
      unityVersion: "2022.3.22f1",
      pluginVersion: "2.0.0-mock",
      protocolV: this.opts.versionMax ?? 1,
      startedAt: new Date().toISOString(),
      ...(advertised !== undefined ? { token: advertised } : {}),
      ...overrides,
    };
    fs.writeFileSync(file, JSON.stringify(entry, null, 2), "utf8");
    return file;
  }

  deleteRegistry(): void {
    const dir = this.opts.registryDir;
    if (dir === undefined) return;
    try {
      fs.unlinkSync(path.join(dir, registryFileName(this.projectPath)));
    } catch {
      // already gone
    }
  }

  // ---- internals ----

  private bind(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => this.onConnection(socket));
      server.on("error", reject);
      server.listen(port, "127.0.0.1", () => {
        server.off("error", reject);
        const addr = server.address();
        if (addr === null || typeof addr === "string") {
          reject(new Error("mock listener has no port"));
          return;
        }
        this.boundPort = addr.port;
        this.server = server;
        resolve();
      });
    });
  }

  private closeListener(): Promise<void> {
    return new Promise((resolve) => {
      const server = this.server;
      this.server = null;
      if (server === null) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });
  }

  private onConnection(socket: net.Socket): void {
    this.connCount += 1;
    socket.setNoDelay(true);
    const conn: MockConn = {
      socket,
      helloSeen: false,
      protocolV: 1,
      decoder: new FrameDecoder({
        onFrame: (frame) => void this.onFrame(conn, frame),
        onError: () => socket.destroy(),
      }),
    };
    this.conns.add(conn);
    socket.on("data", (chunk: Buffer) => conn.decoder.push(chunk));
    socket.on("error", () => undefined);
    socket.on("close", () => this.conns.delete(conn));
  }

  private async onFrame(conn: MockConn, frame: Envelope): Promise<void> {
    if (!conn.helloSeen) {
      if (frame.type !== "hello") {
        conn.socket.destroy();
        return;
      }
      conn.helloSeen = true;
      const hello = frame.payload as HelloPayload;
      this.received.hellos.push(hello);
      const min = this.opts.versionMin ?? 1;
      const max = this.opts.versionMax ?? 1;
      const pick = Math.min(hello.v.max, max);
      if (pick < hello.v.min || pick < min) {
        this.writeTo(conn.socket, {
          id: frame.id,
          type: "res",
          payload: {
            ok: false,
            error: {
              code: "VERSION_UNSUPPORTED",
              message: `no protocol overlap: client ${hello.v.min}-${hello.v.max}, plugin ${min}-${max}`,
              retryable: false,
            } satisfies ErrorObj,
          } satisfies ResPayload,
        });
        conn.socket.end();
        return;
      }
      conn.protocolV = pick;
      if (this.opts.requireToken !== undefined && hello.client.token !== this.opts.requireToken) {
        this.writeTo(conn.socket, {
          id: frame.id,
          type: "res",
          payload: {
            ok: false,
            error: {
              code: "AUTH_REQUIRED",
              message: "invalid or missing connection token",
              retryable: false,
            } satisfies ErrorObj,
          } satisfies ResPayload,
        });
        conn.socket.end();
        return;
      }
      if (this.opts.autoWelcome === false) return; // hello timeout test: stay silent
      this.writeTo(conn.socket, {
        v: pick,
        id: randomUUID(),
        type: "welcome",
        payload: this.welcomePayload(pick),
      });
      return;
    }

    switch (frame.type) {
      case "ping":
        this.writeTo(conn.socket, { id: frame.id, type: "pong", payload: {} });
        return;
      case "cancel": {
        const cancel = frame.payload as CancelPayload;
        this.received.cancels.push(cancel);
        if (this.opts.ignoreCancel === true) {
          this.writeTo(conn.socket, {
            id: frame.id,
            type: "res",
            payload: { ok: true, result: { found: false } } satisfies ResPayload,
          });
          return;
        }
        const flight = this.inFlight.get(cancel.targetId);
        const found = flight !== undefined;
        this.writeTo(conn.socket, {
          id: frame.id,
          type: "res",
          payload: { ok: true, result: { found } } satisfies ResPayload,
        });
        if (flight !== undefined) {
          flight.cancelled = true;
          this.inFlight.delete(cancel.targetId);
          this.writeTo(flight.conn, {
            id: cancel.targetId,
            type: "res",
            payload: {
              ok: false,
              error: { code: "CANCELLED", message: "cancelled", retryable: false },
            } satisfies ResPayload,
          });
        }
        return;
      }
      case "req":
        await this.handleReq(conn, frame as Envelope<ReqPayload>);
        return;
      default:
        return; // ignore anything else
    }
  }

  private async handleReq(conn: MockConn, frame: Envelope<ReqPayload>): Promise<void> {
    const { method, params } = frame.payload;
    this.received.reqs.push({ id: frame.id, method, params });
    const flight: InFlight = { conn: conn.socket, cancelled: false };
    this.inFlight.set(frame.id, flight);

    const ctx: MockHandlerContext = {
      reqId: frame.id,
      progress: (() => {
        let seq = 0;
        return (p: { pct?: number; message?: string; phase?: string }) => {
          if (flight.cancelled) return;
          this.writeTo(conn.socket, {
            id: frame.id,
            type: "progress",
            payload: { ...p, seq: seq++ },
          });
        };
      })(),
      delay: (ms: number) => new Promise((r) => setTimeout(r, ms)),
    };

    try {
      const delayMs = this.opts.methodDelays?.[method];
      if (delayMs !== undefined) await ctx.delay(delayMs);
      const custom = this.opts.handlers?.[method];
      const result =
        custom !== undefined ? await custom(params, ctx) : await this.builtinHandler(method, params, ctx);
      if (flight.cancelled) return;
      this.inFlight.delete(frame.id);
      if (result === METHOD_NOT_FOUND_SENTINEL) {
        this.writeTo(conn.socket, {
          id: frame.id,
          type: "res",
          payload: {
            ok: false,
            error: {
              code: "METHOD_NOT_FOUND",
              message: `unknown method ${method}`,
              retryable: false,
            },
          } satisfies ResPayload,
        });
        return;
      }
      this.writeTo(conn.socket, {
        id: frame.id,
        type: "res",
        payload: { ok: true, result } satisfies ResPayload,
      });
    } catch (err) {
      if (flight.cancelled) return;
      this.inFlight.delete(frame.id);
      const error: ErrorObj =
        err instanceof MockPluginError
          ? {
              code: err.code as ErrorObj["code"],
              message: err.message,
              retryable: err.retryable,
            }
          : {
              code: "HANDLER_EXCEPTION",
              message: err instanceof Error ? err.message : String(err),
              retryable: false,
            };
      this.writeTo(conn.socket, {
        id: frame.id,
        type: "res",
        payload: { ok: false, error } satisfies ResPayload,
      });
    }
  }

  private createJob(method: string, params: unknown, storedResult?: unknown): MockJob {
    const job: MockJob = {
      jobId: `job-${++this.jobSeq}`,
      method,
      params,
      state: "pending",
      ...(storedResult !== undefined ? { storedResult } : {}),
    };
    this.jobs.set(job.jobId, job);
    return job;
  }

  private async builtinHandler(
    method: string,
    params: unknown,
    ctx: MockHandlerContext,
  ): Promise<unknown> {
    const p = (typeof params === "object" && params !== null ? params : {}) as Record<
      string,
      unknown
    >;
    switch (method) {
      case "sys.echo":
        return params;
      case "sys.status":
        return {
          compiling: false,
          playMode: false,
          lastTickAgoMs: 0,
          jobs: { running: this.jobs.size },
          lease: {},
        };
      case "sys.info":
        return this.welcomePayloadBase();
      case "sys.compile.status":
        return { compiling: false, diagnostics: [] };
      case "editor.wake":
        return { woken: true };
      case "state.get":
      case "scene.query":
        // Echo shape: tests assert the exact camelCase wire params.
        return { method, echo: params };
      case "vrc.avatarAudit":
        return { method, echo: params, findings: [] };
      case "camera.capture":
        return { path: "C:/Temp/mock-capture.png", echo: params };
      case "eval.run": {
        if (p.runAsJob === true) {
          const job = this.createJob("eval.run", params, {
            result: "mock-eval",
            logs: [],
            executionMs: 1,
            engine: "csc",
            cached: false,
          });
          return { jobId: job.jobId };
        }
        return { result: "mock-eval", logs: [], executionMs: 1, engine: "csc", cached: false };
      }
      case "job.submit": {
        const jobMethod = typeof p.method === "string" ? p.method : "unknown";
        const job = this.createJob(jobMethod, p.params);
        return { jobId: job.jobId };
      }
      case "job.wait": {
        const jobId = typeof p.jobId === "string" ? p.jobId : "";
        const job = this.jobs.get(jobId);
        if (job === undefined) {
          throw new MockPluginError("JOB_NOT_FOUND", `no job ${jobId}`);
        }
        const behavior = this.opts.jobBehaviors?.[job.method] ?? {};
        if (behavior.neverComplete === true) {
          const waitMs = typeof p.timeoutMs === "number" ? p.timeoutMs : 60_000;
          job.state = "running";
          await ctx.delay(waitMs);
          throw new MockPluginError("TIMEOUT", `job ${jobId} still running after ${waitMs} ms`);
        }
        job.state = "running";
        const steps = behavior.progressSteps ?? 2;
        for (let i = 1; i <= steps; i++) {
          ctx.progress({ pct: Math.round((i / steps) * 100), message: `step ${i}/${steps}` });
          await ctx.delay(behavior.stepDelayMs ?? 15);
        }
        if (behavior.failWith !== undefined) {
          job.state = "failed";
          return { jobId, method: job.method, state: "failed", error: behavior.failWith };
        }
        job.state = "completed";
        return {
          jobId,
          method: job.method,
          state: "completed",
          result: behavior.result ?? job.storedResult ?? { echo: job.params },
        };
      }
      case "job.status": {
        const jobId = typeof p.jobId === "string" ? p.jobId : undefined;
        if (jobId !== undefined) {
          const job = this.jobs.get(jobId);
          if (job === undefined) throw new MockPluginError("JOB_NOT_FOUND", `no job ${jobId}`);
          return { jobId, method: job.method, state: job.state };
        }
        // Real-plugin fidelity: job.status(all) answers a BARE ARRAY
        // (JobManager.AllRecords()), not a {jobs:[...]} wrapper (F-10).
        return [...this.jobs.values()].map((j) => ({
          jobId: j.jobId,
          method: j.method,
          state: j.state,
        }));
      }
      case "job.cancel": {
        const jobId = typeof p.jobId === "string" ? p.jobId : "";
        const job = this.jobs.get(jobId);
        if (job === undefined) return { found: false };
        job.state = "cancelled";
        return { found: true };
      }
      case "lease.acquire":
      case "lease.release":
      case "lease.status":
      case "lease.takeover":
        return { holder: null, ttlMs: 120_000, action: method, echo: params };
      default:
        return METHOD_NOT_FOUND_SENTINEL;
    }
  }

  private welcomePayloadBase(): Omit<WelcomePayload, "v"> {
    return {
      plugin: { version: "2.0.0-mock" },
      unity: {
        version: "2022.3.22f1",
        projectPath: this.projectPath,
        projectName: this.projectName,
      },
      editor: {
        sessionId: this.sessionId,
        pid: process.pid,
        domainReloadCount: this.domainReloadCount,
      },
      eval: { engine: "csc" },
      lease: {},
      features: [],
    };
  }

  private welcomePayload(v: number): WelcomePayload {
    return { v, ...this.welcomePayloadBase() };
  }

  private writeTo(socket: net.Socket, env: Envelope): void {
    if (socket.destroyed) return;
    try {
      socket.write(encodeFrame(env));
    } catch {
      // connection raced shut; tests assert on observable behavior instead
    }
  }
}

const METHOD_NOT_FOUND_SENTINEL = Symbol("METHOD_NOT_FOUND");

/** Handlers can return this to make the mock answer METHOD_NOT_FOUND. */
export const RESPOND_METHOD_NOT_FOUND: unknown = METHOD_NOT_FOUND_SENTINEL;
