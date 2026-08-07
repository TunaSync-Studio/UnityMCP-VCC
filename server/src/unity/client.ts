// UnityClient: Connection + PendingMap + the reconnect state machine from
// PROTOCOL.md. One client per Unity project. Calls made while not ready wait
// in a hold queue until ready or their own deadline.
//
// idle -> discovering -> connecting -> handshaking -> ready
// ready --bye(domain_reload)----------> degraded(grace 180 s) -> reconnecting
// ready --close/err, registry pid alive-> degraded(grace 30 s) -> reconnecting
// ready --close, registry pid dead-----> discovering
// welcome.editor.sessionId changed-----> invalidate caches -> ready
// *     --grace exhausted--------------> failed (fail fast, re-discover 10 s)

import { randomUUID } from "node:crypto";
import { Connection } from "../transport/connection.js";
import { PendingMap } from "../transport/pending.js";
import { resolveProject } from "../discovery.js";
import { UnityMcpError, errorMessage, makeError } from "../errors.js";
import { SERVER_VERSION } from "../version.js";
import type { Config } from "../config.js";
import {
  MAX_IN_FLIGHT,
  PROTOCOL_V,
  type ByePayload,
  type Envelope,
  type EventPayload,
  type HelloPayload,
  type ProgressPayload,
  type RegistryEntry,
  type ReqPayload,
  type WelcomePayload,
} from "../protocol.js";

export type ClientState =
  | "idle"
  | "discovering"
  | "connecting"
  | "handshaking"
  | "ready"
  | "degraded"
  | "reconnecting"
  | "failed";

export interface CallOptions {
  timeoutMs?: number;
  onProgress?: (p: ProgressPayload) => void;
  signal?: AbortSignal;
}

export interface UnityClientHooks {
  onEvent?: (ev: EventPayload) => void;
  /** Editor sessionId changed across a reconnect: caches must be invalidated. */
  onSessionChanged?: (oldId: string, newId: string) => void;
  onStateChange?: (state: ClientState) => void;
}

export interface UnityClientOptions {
  config: Config;
  /** Project selector; falls back to config.projectSelector. */
  selector?: string;
  hooks?: UnityClientHooks;
  // Test knobs - production uses the protocol defaults.
  heartbeatMs?: number;
  helloTimeoutMs?: number;
  graceReloadMs?: number;
  graceCloseMs?: number;
  rediscoverMs?: number;
  backoffMs?: readonly number[];
  pendingSweepMs?: number;
}

interface HoldEntry {
  env: Envelope<ReqPayload>;
  deadlineAt: number;
  timer: NodeJS.Timeout;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  onProgress?: (p: ProgressPayload) => void;
  signal?: AbortSignal;
  abortHandler?: () => void;
}

export interface UnityClientStats {
  reconnects: number;
  sessionChanges: number;
  lateDrops: number;
  timeouts: number;
  unmatched: number;
}

const BACKOFF_MS: readonly number[] = [250, 500, 1000, 2000, 5000];
const GRACE_RELOAD_MS = 180_000;
const GRACE_CLOSE_MS = 30_000;
const REDISCOVER_MS = 10_000;

function jitter(ms: number): number {
  // +/- 20 percent
  return Math.max(10, Math.round(ms * (0.8 + Math.random() * 0.4)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });
}

export class UnityClient {
  readonly sessionId: string = randomUUID();
  private readonly cfg: Config;
  private readonly selector: string | undefined;
  private readonly hooks: UnityClientHooks;
  private readonly pending: PendingMap;
  private conn: Connection | null = null;
  private stateValue: ClientState = "idle";
  private welcomeValue: WelcomePayload | null = null;
  private currentEntry: RegistryEntry | null = null;
  private readonly holdQueue: HoldEntry[] = [];
  private loopRunning = false;
  private graceDeadlineAt: number | null = null;
  private lastBye: ByePayload | null = null;
  private lastSessionId: string | null = null;
  private rediscoverTimer: NodeJS.Timeout | null = null;
  private disposed = false;
  private reconnectCount = 0;
  private sessionChangeCount = 0;
  private readonly graceReloadMs: number;
  private readonly graceCloseMs: number;
  private readonly rediscoverMs: number;
  private readonly backoffMs: readonly number[];
  private readonly heartbeatMs: number | undefined;
  private readonly helloTimeoutMs: number | undefined;

  constructor(opts: UnityClientOptions) {
    this.cfg = opts.config;
    this.selector = opts.selector ?? opts.config.projectSelector;
    this.hooks = opts.hooks ?? {};
    this.graceReloadMs = opts.graceReloadMs ?? GRACE_RELOAD_MS;
    this.graceCloseMs = opts.graceCloseMs ?? GRACE_CLOSE_MS;
    this.rediscoverMs = opts.rediscoverMs ?? REDISCOVER_MS;
    this.backoffMs = opts.backoffMs ?? BACKOFF_MS;
    this.heartbeatMs = opts.heartbeatMs;
    this.helloTimeoutMs = opts.helloTimeoutMs;
    this.pending = new PendingMap({
      onTimeout: (id) => this.sendCancelFrame(id),
      ...(opts.pendingSweepMs !== undefined ? { sweepMs: opts.pendingSweepMs } : {}),
    });
  }

  getState(): ClientState {
    return this.stateValue;
  }

  getWelcome(): WelcomePayload | null {
    return this.welcomeValue;
  }

  getEntry(): RegistryEntry | null {
    return this.currentEntry;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  get stats(): UnityClientStats {
    return {
      reconnects: this.reconnectCount,
      sessionChanges: this.sessionChangeCount,
      lateDrops: this.pending.stats.lateDrops,
      timeouts: this.pending.stats.timeouts,
      unmatched: this.pending.stats.unmatched,
    };
  }

  /** Test-only escape hatch for the ghost-socket regression test. */
  get currentConnectionForTest(): Connection | null {
    return this.conn;
  }

  /**
   * Send a request to the plugin. Lazily connects on first use; while the
   * client is degraded/reconnecting the call waits in the hold queue until
   * ready or its own deadline.
   */
  call(method: string, params: unknown, opts?: CallOptions): Promise<unknown> {
    if (this.disposed) {
      return Promise.reject(makeError("UNITY_UNREACHABLE", "client is disposed"));
    }
    if (opts?.signal?.aborted) {
      return Promise.reject(makeError("CANCELLED", "aborted before send"));
    }
    const timeoutMs = opts?.timeoutMs ?? this.cfg.defaultTimeoutMs;
    const deadlineAt = Date.now() + timeoutMs;
    const env: Envelope<ReqPayload> = {
      id: randomUUID(),
      type: "req",
      payload: { method, params, timeoutMs },
    };
    if (this.stateValue === "ready" && this.conn !== null && this.pending.size < MAX_IN_FLIGHT) {
      return this.sendNow(env, deadlineAt, opts);
    }
    return this.enqueue(env, deadlineAt, opts);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearRediscover();
    const conn = this.conn;
    this.conn = null;
    conn?.destroy();
    this.rejectAllHeld(makeError("UNITY_UNREACHABLE", "client is disposed"));
    this.pending.dispose();
    this.setState("failed");
  }

  // ---- send / hold ----

  private sendNow(
    env: Envelope<ReqPayload>,
    deadlineAt: number,
    opts?: CallOptions,
  ): Promise<unknown> {
    const promise = this.pending.register(env.id, {
      deadlineAt,
      ...(opts?.onProgress ? { onProgress: opts.onProgress } : {}),
    });
    const wired = this.wireAbort(env.id, promise, opts?.signal);
    this.conn?.send(env);
    return wired;
  }

  private wireAbort(
    id: string,
    promise: Promise<unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (!signal) return promise;
    const onAbort = (): void => {
      this.cancelInFlight(id);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    return promise.finally(() => signal.removeEventListener("abort", onAbort));
  }

  private cancelInFlight(id: string): void {
    const wasPending = this.pending.cancelLocal(id, {
      code: "CANCELLED",
      message: "cancelled by caller",
      retryable: false,
    });
    if (wasPending) this.sendCancelFrame(id);
  }

  private sendCancelFrame(targetId: string): void {
    const conn = this.conn;
    if (conn === null || conn.state !== "ready") return;
    const env: Envelope = { id: randomUUID(), type: "cancel", payload: { targetId } };
    this.pending.expectAck(env.id);
    conn.send(env);
  }

  private enqueue(
    env: Envelope<ReqPayload>,
    deadlineAt: number,
    opts?: CallOptions,
  ): Promise<unknown> {
    const holdMs = Math.max(1, deadlineAt - Date.now());
    return new Promise<unknown>((resolve, reject) => {
      const entry: HoldEntry = {
        env,
        deadlineAt,
        resolve,
        reject,
        ...(opts?.onProgress ? { onProgress: opts.onProgress } : {}),
        ...(opts?.signal ? { signal: opts.signal } : {}),
        timer: setTimeout(() => {
          if (this.removeHold(entry)) {
            reject(makeError("TIMEOUT", `timed out after ${holdMs} ms waiting for Unity`));
          }
        }, holdMs),
      };
      entry.timer.unref?.();
      if (opts?.signal) {
        const onAbort = (): void => {
          if (this.removeHold(entry)) {
            reject(makeError("CANCELLED", "cancelled while waiting for Unity"));
          }
        };
        entry.abortHandler = onAbort;
        opts.signal.addEventListener("abort", onAbort, { once: true });
      }
      this.holdQueue.push(entry);
      this.kickLoop();
    });
  }

  /** Remove a hold entry and detach its timers/listeners. True if it was held. */
  private removeHold(entry: HoldEntry): boolean {
    const idx = this.holdQueue.indexOf(entry);
    if (idx === -1) return false;
    this.holdQueue.splice(idx, 1);
    this.detachHold(entry);
    return true;
  }

  private detachHold(entry: HoldEntry): void {
    clearTimeout(entry.timer);
    if (entry.signal && entry.abortHandler) {
      entry.signal.removeEventListener("abort", entry.abortHandler);
    }
  }

  private flushHold(): void {
    while (
      this.stateValue === "ready" &&
      this.conn !== null &&
      this.holdQueue.length > 0 &&
      this.pending.size < MAX_IN_FLIGHT
    ) {
      const entry = this.holdQueue.shift();
      if (!entry) return;
      this.detachHold(entry);
      if (entry.signal?.aborted) {
        entry.reject(makeError("CANCELLED", "cancelled while waiting for Unity"));
        continue;
      }
      const remaining = entry.deadlineAt - Date.now();
      if (remaining <= 0) {
        entry.reject(makeError("TIMEOUT", "deadline passed while waiting for Unity"));
        continue;
      }
      const promise = this.pending.register(entry.env.id, {
        deadlineAt: entry.deadlineAt,
        ...(entry.onProgress ? { onProgress: entry.onProgress } : {}),
      });
      this.wireAbort(entry.env.id, promise, entry.signal).then(entry.resolve, entry.reject);
      this.conn.send(entry.env);
    }
  }

  private rejectAllHeld(err: UnityMcpError): void {
    while (this.holdQueue.length > 0) {
      const entry = this.holdQueue.shift();
      if (!entry) return;
      this.detachHold(entry);
      entry.reject(err);
    }
  }

  // ---- state machine ----

  private setState(next: ClientState): void {
    if (this.stateValue === next) return;
    this.stateValue = next;
    this.hooks.onStateChange?.(next);
  }

  private kickLoop(): void {
    if (this.disposed) return;
    if (this.stateValue === "ready") {
      this.flushHold();
      return;
    }
    if (this.loopRunning) return;
    if (this.stateValue === "failed") {
      // A new call while failed triggers one fresh fail-fast attempt.
      this.graceDeadlineAt = null;
    }
    void this.runLoop();
  }

  /**
   * Single connect loop. Without a grace window (initial connect, rediscover)
   * one attempt is made and failure is fail-fast. With a grace window
   * (degraded after bye/close) attempts repeat with backoff until the grace
   * deadline, then the client fails and held calls get RECONNECT_TIMEOUT.
   */
  private async runLoop(): Promise<void> {
    if (this.loopRunning || this.disposed) return;
    this.loopRunning = true;
    try {
      let attempt = 0;
      for (;;) {
        if (this.disposed) return;
        const inGrace = this.graceDeadlineAt !== null;
        if (inGrace && Date.now() >= (this.graceDeadlineAt ?? 0)) {
          this.enterFailed(
            makeError("RECONNECT_TIMEOUT", "reconnect grace window exhausted", {
              retryable: false,
            }),
          );
          return;
        }
        this.setState(inGrace ? "reconnecting" : "discovering");

        let entry: RegistryEntry;
        try {
          entry = resolveProject(this.cfg, this.selector);
        } catch (err) {
          if (!inGrace) {
            this.enterFailed(
              err instanceof UnityMcpError
                ? err
                : makeError("PROJECT_NOT_FOUND", errorMessage(err)),
            );
            return;
          }
          attempt += 1;
          await sleep(this.backoffDelay(attempt));
          continue;
        }

        this.currentEntry = entry;
        this.setState("connecting");
        const conn = new Connection({
          host: "127.0.0.1",
          port: entry.port,
          hello: this.buildHello(entry),
          ...(this.helloTimeoutMs !== undefined ? { helloTimeoutMs: this.helloTimeoutMs } : {}),
          ...(this.heartbeatMs !== undefined ? { heartbeatMs: this.heartbeatMs } : {}),
          events: {
            onHandshaking: () => {
              if (!this.disposed && this.stateValue === "connecting") {
                this.setState("handshaking");
              }
            },
            onRes: (id, payload) => {
              if (this.conn !== conn) return;
              this.pending.resolveRes(id, payload);
              this.flushHold();
            },
            onProgress: (id, payload) => {
              if (this.conn !== conn) return;
              this.pending.progress(id, payload);
            },
            onEvent: (payload) => {
              if (this.conn !== conn) return;
              this.hooks.onEvent?.(payload);
            },
            onBye: (payload) => {
              if (this.conn !== conn) return;
              this.lastBye = payload;
            },
            onError: (err) => {
              if (this.conn !== conn) return;
              console.error(`[unity-mcp] connection error: ${errorMessage(err)}`);
            },
            onClose: () => {
              this.handleClose(conn);
            },
          },
        });

        try {
          const welcome = await conn.connect();
          if (this.disposed) {
            conn.destroy();
            return;
          }
          this.adopt(conn, welcome);
          return;
        } catch (err) {
          conn.destroy();
          if (err instanceof UnityMcpError && err.code === "VERSION_UNSUPPORTED") {
            this.enterFailed(err);
            return;
          }
          if (err instanceof UnityMcpError && err.code === "AUTH_REQUIRED") {
            // Terminal: retrying with the same registry token cannot succeed,
            // so fail fast instead of entering a retry loop. The background
            // rediscover picks up a fresh registry entry (new token) later.
            this.enterFailed(
              makeError(
                "AUTH_REQUIRED",
                "registry token mismatch - is the editor running as a different user?",
                { detail: { pluginMessage: err.obj.message } },
              ),
            );
            return;
          }
          if (!inGrace) {
            this.enterFailed(
              makeError("UNITY_UNREACHABLE", `connect to Unity failed: ${errorMessage(err)}`),
            );
            return;
          }
          attempt += 1;
          await sleep(this.backoffDelay(attempt));
        }
      }
    } finally {
      this.loopRunning = false;
    }
  }

  private backoffDelay(attempt: number): number {
    const idx = Math.min(attempt - 1, this.backoffMs.length - 1);
    return jitter(this.backoffMs[idx] ?? 5000);
  }

  private buildHello(entry: RegistryEntry): HelloPayload {
    return {
      v: { min: 1, max: PROTOCOL_V },
      client: {
        name: "unity-mcp-server",
        version: SERVER_VERSION,
        pid: process.pid,
        sessionId: this.sessionId,
        // v2.1: echo the registry token so the plugin can authenticate us.
        ...(entry.token !== undefined && entry.token.length > 0 ? { token: entry.token } : {}),
      },
      features: [],
    };
  }

  private adopt(conn: Connection, welcome: WelcomePayload): void {
    if (this.conn !== null && this.conn !== conn) {
      this.conn.destroy();
    }
    this.conn = conn;
    this.welcomeValue = welcome;
    this.graceDeadlineAt = null;
    this.lastBye = null;
    this.clearRediscover();
    const sid = welcome.editor.sessionId;
    if (this.lastSessionId !== null && this.lastSessionId !== sid) {
      this.sessionChangeCount += 1;
      this.hooks.onSessionChanged?.(this.lastSessionId, sid);
    }
    if (this.lastSessionId !== null) this.reconnectCount += 1;
    this.lastSessionId = sid;
    this.setState("ready");
    conn.release();
    this.flushHold();
  }

  private handleClose(conn: Connection): void {
    // Ghost guard: a stale connection closing must never touch live state.
    if (this.conn !== conn) return;
    this.conn = null;
    if (this.disposed) return;

    const bye = this.lastBye;
    this.lastBye = null;

    // Anything the plugin left in flight cannot complete on this connection.
    this.pending.failAll(
      bye?.reason === "domain_reload"
        ? {
            code: "DOMAIN_RELOAD",
            message: "connection closed for domain reload",
            retryable: true,
          }
        : { code: "UNITY_UNREACHABLE", message: "connection to Unity closed", retryable: false },
    );

    if (bye && (bye.reason === "quit" || bye.reason === "shutdown")) {
      this.enterFailed(makeError("UNITY_UNREACHABLE", `Unity said bye (${bye.reason})`));
      return;
    }

    if (bye?.reason === "domain_reload") {
      this.graceDeadlineAt = Date.now() + this.graceReloadMs;
      this.setState("degraded");
      void this.runLoop();
      return;
    }

    // Unexpected close: registry pid still alive -> short grace reconnect;
    // pid dead -> fresh discovery (project may have moved ports or gone away).
    let stillRegistered = false;
    try {
      resolveProject(this.cfg, this.selector);
      stillRegistered = true;
    } catch {
      stillRegistered = false;
    }
    if (stillRegistered) {
      this.graceDeadlineAt = Date.now() + this.graceCloseMs;
      this.setState("degraded");
    } else {
      this.graceDeadlineAt = null;
      this.setState("discovering");
    }
    void this.runLoop();
  }

  private enterFailed(err: UnityMcpError): void {
    this.graceDeadlineAt = null;
    this.setState("failed");
    this.rejectAllHeld(err);
    this.scheduleRediscover();
  }

  private scheduleRediscover(): void {
    if (this.rediscoverTimer !== null || this.disposed) return;
    this.rediscoverTimer = setInterval(() => {
      if (this.disposed || this.stateValue !== "failed") {
        this.clearRediscover();
        return;
      }
      try {
        resolveProject(this.cfg, this.selector);
      } catch {
        return; // still nothing to connect to
      }
      this.clearRediscover();
      this.graceDeadlineAt = null;
      void this.runLoop();
    }, this.rediscoverMs);
    this.rediscoverTimer.unref?.();
  }

  private clearRediscover(): void {
    if (this.rediscoverTimer !== null) {
      clearInterval(this.rediscoverTimer);
      this.rediscoverTimer = null;
    }
  }
}
