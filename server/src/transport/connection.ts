// Connection: owns exactly ONE socket lifecycle (single-use object).
// connect() dials, sends hello, awaits welcome (<= helloTimeoutMs), then the
// connection is ready. All socket handlers are identity-guarded on the socket
// instance, and consumers identity-guard on the Connection instance - this is
// the structural fix for the v1 ghost-socket bug (a stale connection's close
// handler clearing state that a newer live connection depends on). There is
// deliberately no module-level or global state in this file.

import * as net from "node:net";
import { randomUUID } from "node:crypto";
import { FrameDecoder, encodeFrame, FrameError } from "./frame.js";
import { UnityMcpError, makeError } from "../errors.js";
import {
  HELLO_TIMEOUT_MS,
  PROTOCOL_V,
  type ByePayload,
  type Envelope,
  type EventPayload,
  type HelloPayload,
  type ProgressPayload,
  type ResPayload,
  type WelcomePayload,
} from "../protocol.js";

export const HEARTBEAT_MS = 10_000;
export const HEARTBEAT_MAX_MISSES = 2;

export type ConnectionState = "idle" | "connecting" | "handshaking" | "ready" | "closed";

export interface ConnectionEvents {
  onHandshaking?: () => void;
  onRes: (id: string, payload: ResPayload) => void;
  onProgress: (id: string, payload: ProgressPayload) => void;
  onEvent: (payload: EventPayload) => void;
  onBye: (payload: ByePayload) => void;
  /** Fired exactly once when the socket is fully closed. */
  onClose: () => void;
  /** Transport-level error; close always follows. */
  onError: (err: Error) => void;
}

export interface ConnectionOptions {
  host: string;
  port: number;
  hello: HelloPayload;
  events: ConnectionEvents;
  helloTimeoutMs?: number;
  /** Heartbeat interval; 0 disables (tests). */
  heartbeatMs?: number;
}

export class Connection {
  private socket: net.Socket | null = null;
  private readonly decoder: FrameDecoder;
  private stateValue: ConnectionState = "idle";
  private welcomeValue: WelcomePayload | null = null;
  private helloTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pendingPings = 0;
  private closedEmitted = false;
  private released = false;
  private readonly inbox: Envelope[] = [];
  private hsResolve: ((w: WelcomePayload) => void) | null = null;
  private hsReject: ((err: unknown) => void) | null = null;
  private hsSocketError: Error | null = null;
  private readonly helloTimeoutMs: number;
  private readonly heartbeatMs: number;

  constructor(private readonly opts: ConnectionOptions) {
    this.helloTimeoutMs = opts.helloTimeoutMs ?? HELLO_TIMEOUT_MS;
    this.heartbeatMs = opts.heartbeatMs ?? HEARTBEAT_MS;
    this.decoder = new FrameDecoder({
      onFrame: (frame) => this.handleFrame(frame),
      onError: (err) => this.handleFrameError(err),
    });
  }

  get state(): ConnectionState {
    return this.stateValue;
  }

  get welcome(): WelcomePayload | null {
    return this.welcomeValue;
  }

  /** Dial + handshake. Resolves with the welcome payload once ready. */
  connect(): Promise<WelcomePayload> {
    if (this.stateValue !== "idle") {
      return Promise.reject(new Error("Connection is single-use; create a new instance"));
    }
    return new Promise<WelcomePayload>((resolve, reject) => {
      this.hsResolve = resolve;
      this.hsReject = reject;
      this.stateValue = "connecting";
      const sock = net.connect({ host: this.opts.host, port: this.opts.port });
      this.socket = sock;
      sock.setNoDelay(true);

      sock.on("connect", () => {
        if (this.socket !== sock) return;
        this.stateValue = "handshaking";
        this.opts.events.onHandshaking?.();
        this.writeRaw({
          v: PROTOCOL_V,
          id: randomUUID(),
          type: "hello",
          payload: this.opts.hello,
        });
        this.helloTimer = setTimeout(() => {
          if (this.socket !== sock) return;
          this.failHandshake(
            makeError("HELLO_TIMEOUT", `no welcome within ${this.helloTimeoutMs} ms`, {
              retryable: false,
            }),
          );
        }, this.helloTimeoutMs);
        this.helloTimer.unref?.();
      });

      sock.on("data", (chunk: Buffer) => {
        if (this.socket !== sock) return;
        this.decoder.push(chunk);
      });

      sock.on("error", (err: Error) => {
        if (this.socket !== sock) return;
        if (this.stateValue === "connecting" || this.stateValue === "handshaking") {
          this.hsSocketError = err;
        } else {
          this.opts.events.onError(err);
        }
      });

      sock.on("close", () => {
        if (this.socket !== sock) return;
        this.handleClosed();
      });
    });
  }

  /**
   * Flush frames buffered between welcome and adoption by the owner. The owner
   * calls this after wiring itself to the connection, so no frame that arrived
   * coalesced with the welcome is lost or delivered to a not-yet-adopted conn.
   */
  release(): void {
    if (this.released) return;
    this.released = true;
    while (this.inbox.length > 0) {
      const frame = this.inbox.shift();
      if (frame) this.dispatch(frame);
    }
  }

  /** Send an envelope; returns false when the connection cannot transmit. */
  send(env: Envelope): boolean {
    if (this.stateValue !== "ready" || this.socket === null) return false;
    return this.writeRaw(env);
  }

  destroy(err?: Error): void {
    if (err) this.opts.events.onError(err);
    const sock = this.socket;
    this.clearTimers();
    // Transition synchronously so no caller can observe a zombie state
    // between destroy() and the async socket close event.
    const wasHandshake = this.stateValue === "connecting" || this.stateValue === "handshaking";
    this.stateValue = "closed";
    if (wasHandshake) {
      const reject = this.hsReject;
      this.hsResolve = null;
      this.hsReject = null;
      reject?.(
        err ??
          this.hsSocketError ??
          makeError("UNITY_UNREACHABLE", "connection destroyed during handshake"),
      );
    }
    if (sock !== null) {
      // handleClosed still runs via the socket close event (identity guard
      // passes) and emits onClose exactly once.
      sock.destroy();
    } else {
      this.emitCloseOnce();
    }
  }

  private writeRaw(env: Envelope): boolean {
    const sock = this.socket;
    if (sock === null || sock.destroyed) return false;
    try {
      sock.write(encodeFrame(env));
      return true;
    } catch (err) {
      this.opts.events.onError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }

  private handleFrame(frame: Envelope): void {
    if (this.stateValue === "handshaking") {
      this.handleHandshakeFrame(frame);
      return;
    }
    if (frame.type === "pong") {
      this.pendingPings = 0;
      return;
    }
    if (!this.released) {
      this.inbox.push(frame);
      return;
    }
    this.dispatch(frame);
  }

  private handleHandshakeFrame(frame: Envelope): void {
    if (frame.type === "welcome") {
      const w = frame.payload as WelcomePayload;
      if (typeof w.v !== "number" || w.v < 1 || w.v > PROTOCOL_V) {
        this.failHandshake(
          makeError("VERSION_UNSUPPORTED", `plugin selected protocol v=${String(w.v)}`),
        );
        return;
      }
      this.welcomeValue = w;
      this.stateValue = "ready";
      if (this.helloTimer) {
        clearTimeout(this.helloTimer);
        this.helloTimer = null;
      }
      this.startHeartbeat();
      const resolve = this.hsResolve;
      this.hsResolve = null;
      this.hsReject = null;
      resolve?.(w);
      return;
    }
    if (frame.type === "res") {
      const p = frame.payload as ResPayload;
      const err = p.ok
        ? makeError("PROTOCOL_ERROR", "unexpected successful res during handshake")
        : new UnityMcpError(
            p.error ?? {
              code: "PROTOCOL_ERROR",
              message: "handshake rejected without error object",
              retryable: false,
            },
          );
      this.failHandshake(err);
      return;
    }
    console.error(`[unity-mcp] ignoring unexpected ${frame.type} frame during handshake`);
  }

  private dispatch(frame: Envelope): void {
    switch (frame.type) {
      case "res":
        this.opts.events.onRes(frame.id, frame.payload as ResPayload);
        return;
      case "progress":
        this.opts.events.onProgress(frame.id, frame.payload as ProgressPayload);
        return;
      case "event":
        this.opts.events.onEvent(frame.payload as EventPayload);
        return;
      case "bye":
        this.opts.events.onBye(frame.payload as ByePayload);
        return;
      case "pong":
        this.pendingPings = 0;
        return;
      default:
        console.error(`[unity-mcp] ignoring unexpected ${frame.type} frame from plugin`);
    }
  }

  private handleFrameError(err: FrameError): void {
    if (this.stateValue === "connecting" || this.stateValue === "handshaking") {
      this.failHandshake(makeError("PARSE_ERROR", `framing error during handshake: ${err.message}`));
      return;
    }
    this.opts.events.onError(err);
    this.destroy();
  }

  private failHandshake(err: UnityMcpError): void {
    const reject = this.hsReject;
    this.hsResolve = null;
    this.hsReject = null;
    reject?.(err);
    this.destroy();
  }

  private handleClosed(): void {
    this.socket = null;
    this.clearTimers();
    const wasHandshake = this.stateValue === "connecting" || this.stateValue === "handshaking";
    this.stateValue = "closed";
    if (wasHandshake) {
      const reject = this.hsReject;
      this.hsResolve = null;
      this.hsReject = null;
      reject?.(
        this.hsSocketError ??
          makeError("UNITY_UNREACHABLE", "connection closed before handshake completed"),
      );
    }
    this.emitCloseOnce();
  }

  private emitCloseOnce(): void {
    if (this.closedEmitted) return;
    this.closedEmitted = true;
    this.opts.events.onClose();
  }

  private startHeartbeat(): void {
    if (this.heartbeatMs <= 0) return;
    this.heartbeatTimer = setInterval(() => {
      if (this.stateValue !== "ready") return;
      if (this.pendingPings >= HEARTBEAT_MAX_MISSES) {
        this.opts.events.onError(
          new Error(`heartbeat: ${this.pendingPings} pings unanswered, forcing reconnect`),
        );
        this.destroy();
        return;
      }
      this.pendingPings += 1;
      this.writeRaw({ id: randomUUID(), type: "ping", payload: {} });
    }, this.heartbeatMs);
    this.heartbeatTimer.unref?.();
  }

  private clearTimers(): void {
    if (this.helloTimer) {
      clearTimeout(this.helloTimer);
      this.helloTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
