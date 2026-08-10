// F-5 (2.6.3): when discovery short-circuits with BUSY_MODAL because the
// registry heartbeat is stale (F-12 path), ask the blocked editor itself for
// the dialog name. The plugin answers hello and its >3 s watchdog path
// entirely on the transport thread, so this works precisely while the main
// thread is stuck - the one moment the modal name matters. Without this,
// P0-1's "name the blocking dialog" went dark exactly on long blocks (the
// heartbeat aged past the stale threshold and the server stopped asking).

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
} from "../protocol.js";

export const BLOCKED_PROBE_TIMEOUT_MS = 5_000;

export type BlockedProbeFn = (
  entry: RegistryEntry,
  timeoutMs?: number,
) => Promise<ErrorObj | null>;

/**
 * One-shot request against a possibly-blocked editor. Resolves the plugin's
 * error object (normally its watchdog BUSY_MODAL, which carries detail.modal)
 * or null on success/any transport failure. Never throws, never lingers.
 */
export async function probeBlockedEditor(
  entry: RegistryEntry,
  timeoutMs: number = BLOCKED_PROBE_TIMEOUT_MS,
): Promise<ErrorObj | null> {
  return await new Promise<ErrorObj | null>((resolve) => {
    let conn: Connection | null = null;
    let settled = false;
    const finish = (v: ErrorObj | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      conn?.destroy();
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    timer.unref?.();
    const reqId = randomUUID();
    try {
      conn = new Connection({
        host: "127.0.0.1",
        port: entry.port,
        helloTimeoutMs: Math.min(timeoutMs, 4_000),
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
          onRes: (id, payload) => {
            if (id !== reqId) return;
            // Success means the editor unblocked between scan and probe -
            // nothing to name; let the caller's original error stand.
            finish(payload.ok ? null : (payload.error ?? null));
          },
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
          const env: Envelope<ReqPayload> = {
            id: reqId,
            type: "req",
            payload: {
              method: "sys.status",
              params: {},
              timeoutMs: Math.min(timeoutMs, 4_000),
            },
          };
          if (conn?.send(env) !== true) finish(null);
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

/**
 * If `obj` is the F-12 "unresponsive" BUSY_MODAL (heartbeatAgeMs present, no
 * modal info), probe the blocked editor live and graft its watchdog answer -
 * message with the named dialog plus detail.modal/modalCount/lastTickAgoMs -
 * while keeping F-12's candidates and heartbeatAgeMs. Best-effort: on any
 * failure the original error returns unchanged.
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
  const probed = await probe(entry);
  if (probed === null || probed.code !== "BUSY_MODAL") return obj;
  const probedDetail =
    typeof probed.detail === "object" && probed.detail !== null ? probed.detail : {};
  return {
    ...probed,
    detail: {
      ...(probedDetail as Record<string, unknown>),
      candidates: detail.candidates,
      heartbeatAgeMs: detail.heartbeatAgeMs,
      probedLive: true,
    },
  };
}
