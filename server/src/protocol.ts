// Wire protocol contract — mirror of docs/PROTOCOL.md and Editor/Core/Protocol.cs.
// Any change lands in all three or not at all.

export const PROTOCOL_V = 1;
export const MAX_FRAME_BYTES = 64 * 1024 * 1024;
export const MAX_IN_FLIGHT = 32;
export const HELLO_TIMEOUT_MS = 5_000;
export const PORT_BASE = 47700;
export const PORT_SLOTS = 64;
export const PORT_PROBE_STEPS = 8;

export type FrameType =
  | "hello"
  | "welcome"
  | "req"
  | "res"
  | "progress"
  | "event"
  | "cancel"
  | "ping"
  | "pong"
  | "bye";

export interface Envelope<T = unknown> {
  v?: number; // hello/welcome only
  id: string; // uuid; res/progress echo the req id
  type: FrameType;
  payload: T;
}

export interface HelloPayload {
  v: { min: number; max: number };
  client: {
    name: string;
    version: string;
    pid: number;
    sessionId: string;
    /** Registry token (v2.1+): echoed from the registry entry when present. */
    token?: string;
  };
  features: string[];
}

export interface WelcomePayload {
  v: number;
  plugin: { version: string };
  unity: { version: string; projectPath: string; projectName: string };
  editor: { sessionId: string; pid: number; domainReloadCount: number };
  eval: { engine: "csc" | "codedom" | "none" };
  lease: { holder?: string };
  features: string[];
}

export interface ReqPayload {
  method: string;
  params: unknown;
  timeoutMs?: number;
  leaseHint?: string;
}

export interface ResPayload {
  ok: boolean;
  result?: unknown;
  error?: ErrorObj;
}

export interface ProgressPayload {
  pct?: number;
  message?: string;
  phase?: string;
  seq: number;
}

export interface EventPayload {
  kind: EventKind;
  data: unknown;
}

export type EventKind =
  | "log"
  | "compile.started"
  | "compile.finished"
  | "reload.imminent"
  | "playmode.changed"
  | "job.progress"
  | "job.terminal"
  | "lease.lost";

export interface CancelPayload {
  targetId: string;
}

export interface ByePayload {
  reason: "domain_reload" | "quit" | "shutdown";
  resumeHintMs?: number;
}

export interface Diagnostic {
  file: string;
  line: number;
  col: number;
  severity: "error" | "warning";
  csCode: string;
  text: string;
}

export interface ErrorObj {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  detail?: unknown;
  unityStack?: string;
  consoleErrors?: string[];
  diagnostics?: Diagnostic[];
}

export type ErrorCode =
  // plugin-side
  | "PARSE_ERROR"
  | "PROTOCOL_ERROR"
  | "VERSION_UNSUPPORTED"
  | "AUTH_REQUIRED"
  | "HELLO_TIMEOUT"
  | "METHOD_NOT_FOUND"
  | "INVALID_PARAMS"
  | "HANDLER_EXCEPTION"
  | "TIMEOUT"
  | "CANCELLED"
  | "DOMAIN_RELOAD"
  | "BUSY_MODAL"
  | "LEASE_HELD"
  | "LEASE_LOST"
  | "JOB_NOT_FOUND"
  | "JOB_NOT_RESUMABLE"
  | "EVAL_COMPILE_ERROR"
  | "EVAL_RUNTIME_ERROR"
  | "EVAL_ENGINE_UNAVAILABLE"
  // server-synthesized
  | "UNITY_UNREACHABLE"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_AMBIGUOUS"
  | "RECONNECT_TIMEOUT"
  // VCC/VPM layer (v2.4.0, server-local - no plugin involved)
  | "VRC_GET_NOT_FOUND"
  | "VRC_GET_FAILED";

export const RETRYABLE_CODES: ReadonlySet<ErrorCode> = new Set([
  "DOMAIN_RELOAD",
  "BUSY_MODAL",
]);

export interface RegistryEntry {
  schemaVersion: number;
  port: number;
  projectPath: string;
  projectName: string;
  pid: number;
  unityVersion: string;
  pluginVersion: string;
  protocolV: number;
  startedAt: string;
  /** Connection token (v2.1+): clients echo it in hello.client.token. */
  token?: string;
}

export interface JobRecord {
  jobId: string;
  method: string;
  state: "pending" | "running" | "completed" | "failed" | "cancelled";
  phase?: string;
  pct?: number;
  message?: string;
  ownerSessionId: string;
  startedAt: string;
  updatedAt: string;
  result?: unknown;
  error?: ErrorObj;
  reloadCount: number;
}

/** fnv1a32 over the normalized project path; used for port slot + registry filename. */
export function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Absolute path → forward slashes, no trailing slash, lower-case (Windows). */
export function normalizeProjectPath(p: string): string {
  let s = p.replace(/\\/g, "/");
  while (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s.toLowerCase();
}

export function preferredPort(projectPath: string): number {
  return PORT_BASE + (fnv1a32(normalizeProjectPath(projectPath)) % PORT_SLOTS);
}

export function registryFileName(projectPath: string): string {
  return fnv1a32(normalizeProjectPath(projectPath)).toString(16).padStart(8, "0") + ".json";
}
