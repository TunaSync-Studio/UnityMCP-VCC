// F-5/F-8: when discovery short-circuits with BUSY_MODAL because the registry
// heartbeat is stale (F-12 path), ask the blocked editor itself for the dialog
// name. hello/welcome and the sys.* fast paths run on the plugin's transport
// thread, so this works precisely while the main thread is stuck - the one
// moment the modal name matters.
//
// F-8 history: the first version probed with sys.status, which the plugin
// answers on its transport thread BEFORE the watchdog - the probe always got
// `ok` and the enrichment never fired in the field. The probe now asks
// `sys.modal` (2.6.4 plugin, transport-thread fast path, watchdog-independent)
// and falls back to `sys.echo` for older plugins: echo is queued to the main
// thread, so the >3 s watchdog answers BUSY_MODAL carrying detail.modal.

import { randomUUID } from "node:crypto";
import { Connection } from "../transport/connection.js";
import { scanRegistry } from "../discovery.js";
import { SERVER_VERSION } from "../version.js";
import type { Config } from "../config.js";
import {
  PROTOCOL_V,
  type Envelope,
  type ErrorObj,
  type RegistryEntry,
  type ReqPayload,
  type ResPayload,
} from "../protocol.js";

export const BLOCKED_PROBE_TIMEOUT_MS = 5_000;

export interface BlockedModalInfo {
  title?: string;
  buttons?: string[];
  kind?: string;
}

export interface BlockedModalAnswer {
  modal: BlockedModalInfo | null;
  modalCount: number;
  lastTickAgoMs?: number;
}

export type BlockedProbeFn = (
  entry: RegistryEntry,
  timeoutMs?: number,
) => Promise<BlockedModalAnswer | null>;

function answerFromModalResult(result: unknown): BlockedModalAnswer | null {
  if (typeof result !== "object" || result === null) return null;
  const r = result as Record<string, unknown>;
  return {
    modal: (r.modal as BlockedModalInfo | null | undefined) ?? null,
    modalCount: typeof r.modalCount === "number" ? r.modalCount : 0,
    ...(typeof r.lastTickAgoMs === "number" ? { lastTickAgoMs: r.lastTickAgoMs } : {}),
  };
}

function answerFromWatchdogError(err: ErrorObj): BlockedModalAnswer | null {
  if (err.code !== "BUSY_MODAL") return null;
  const d =
    typeof err.detail === "object" && err.detail !== null
      ? (err.detail as Record<string, unknown>)
      : {};
  return {
    modal: (d.modal as BlockedModalInfo | null | undefined) ?? null,
    modalCount: typeof d.modalCount === "number" ? d.modalCount : 0,
    ...(typeof d.lastTickAgoMs === "number" ? { lastTickAgoMs: d.lastTickAgoMs } : {}),
  };
}

/**
 * One-shot probe against a possibly-blocked editor. Resolves the editor's
 * modal answer, or null on success-without-signal or any transport failure.
 * Never throws, never lingers past timeoutMs.
 */
export async function probeBlockedEditor(
  entry: RegistryEntry,
  timeoutMs: number = BLOCKED_PROBE_TIMEOUT_MS,
): Promise<BlockedModalAnswer | null> {
  return await new Promise<BlockedModalAnswer | null>((resolve) => {
    let conn: Connection | null = null;
    let settled = false;
    const finish = (v: BlockedModalAnswer | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      conn?.destroy();
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    timer.unref?.();
    const modalReqId = randomUUID();
    const echoReqId = randomUUID();
    const wireTimeout = Math.min(timeoutMs, 4_000);
    const sendReq = (id: string, method: string): void => {
      const env: Envelope<ReqPayload> = {
        id,
        type: "req",
        payload: { method, params: {}, timeoutMs: wireTimeout },
      };
      if (conn?.send(env) !== true) finish(null);
    };
    const onRes = (id: string, payload: ResPayload): void => {
      if (id === modalReqId) {
        if (payload.ok) {
          finish(answerFromModalResult(payload.result));
          return;
        }
        if (payload.error?.code === "METHOD_NOT_FOUND") {
          // Pre-2.6.4 plugin: fall back to a main-thread method; the >3 s
          // watchdog answers BUSY_MODAL (with detail.modal) from the
          // transport thread while the main thread is stuck.
          sendReq(echoReqId, "sys.echo");
          return;
        }
        finish(payload.error ? answerFromWatchdogError(payload.error) : null);
        return;
      }
      if (id === echoReqId) {
        // ok = the editor answered on the main thread - not blocked (or it
        // unblocked between scan and probe); nothing to name.
        finish(payload.ok ? null : (payload.error ? answerFromWatchdogError(payload.error) : null));
      }
    };
    try {
      conn = new Connection({
        host: "127.0.0.1",
        port: entry.port,
        helloTimeoutMs: wireTimeout,
        heartbeatMs: 0,
        hello: {
          v: { min: 1, max: PROTOCOL_V },
          client: {
            name: "unity-mcp-server/blocked-probe",
            version: SERVER_VERSION,
            pid: process.pid,
            sessionId: randomUUID(),
            ...(entry.token !== undefined && entry.token.length > 0
              ? { token: entry.token }
              : {}),
          },
          features: [],
        },
        events: {
          onRes,
          onProgress: () => {},
          onEvent: () => {},
          onBye: () => {},
          onError: () => {},
          onClose: () => finish(null),
        },
      });
      conn
        .connect()
        .then(() => {
          conn?.release();
          sendReq(modalReqId, "sys.modal");
        })
        .catch(() => finish(null));
    } catch {
      finish(null);
    }
  });
}

function registryEntryForPid(cfg: Config, pid: number): RegistryEntry | null {
  for (const d of scanRegistry(cfg)) {
    if (d.entry.pid === pid) return d.entry;
  }
  return null;
}

interface F12Detail {
  candidates?: Array<{ pid?: number }>;
  heartbeatAgeMs?: number;
  [k: string]: unknown;
}

/** The plugin's own advice wording, replicated for the server-built line. */
function modalLineFor(answer: BlockedModalAnswer): string {
  const m = answer.modal;
  if (m === null || answer.modalCount === 0) {
    return (
      "\n  live probe: no native dialog is up - a long import/compile or a hung " +
      "editor, not an unclicked dialog."
    );
  }
  const advice =
    m.kind === "progress"
      ? "\n  This is a progress dialog; it clears itself. Do NOT press Cancel - that aborts the operation. Retry after it finishes."
      : "\n  A human must dismiss this dialog in the editor UI; retrying alone will not clear it.";
  return (
    `\n  modal: "${m.title ?? ""}"  buttons: [${(m.buttons ?? []).join(", ")}]  kind: ${m.kind ?? "decision"}` +
    (answer.modalCount > 1 ? `  (+${answer.modalCount - 1} more)` : "") +
    advice
  );
}

/**
 * If `obj` is the F-12 "unresponsive" BUSY_MODAL (heartbeatAgeMs present, no
 * modal info), probe the blocked editor live and graft the modal answer -
 * named dialog plus detail.modal/modalCount/lastTickAgoMs - while keeping
 * F-12's candidates and heartbeatAgeMs. Best-effort: on any failure the
 * original error returns unchanged.
 */
export async function enrichBusyModal(
  cfg: Config | null,
  obj: ErrorObj,
  probe: BlockedProbeFn = probeBlockedEditor,
): Promise<ErrorObj> {
  if (cfg === null || obj.code !== "BUSY_MODAL") return obj;
  const detail = obj.detail as F12Detail | undefined;
  if (detail === undefined || typeof detail !== "object") return obj;
  if (detail.heartbeatAgeMs === undefined || "modal" in detail) return obj;
  const pid = detail.candidates?.[0]?.pid;
  if (typeof pid !== "number") return obj;
  const entry = registryEntryForPid(cfg, pid);
  if (entry === null) return obj;
  const answer = await probe(entry);
  if (answer === null) return obj;
  return {
    ...obj,
    message: obj.message + modalLineFor(answer),
    detail: {
      ...detail,
      modal: answer.modal,
      modalCount: answer.modalCount,
      ...(answer.lastTickAgoMs !== undefined ? { lastTickAgoMs: answer.lastTickAgoMs } : {}),
      probedLive: true,
      // Only the first candidate is probed. Say WHICH editor answered, so a
      // multi-candidate error cannot be misread as "this dialog belongs to
      // whichever project you had in mind".
      probedPid: pid,
      ...(Array.isArray(detail.candidates) && detail.candidates.length > 1
        ? { probedCandidates: `1 of ${detail.candidates.length} (first)` }
        : {}),
    },
  };
}
