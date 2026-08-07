// Correlation map for in-flight requests: id -> promise, with a single timeout
// sweep interval and 60 s tombstones so a late res on a timed-out or cancelled
// id is counted and logged but never delivered.

import type { ErrorObj, ProgressPayload, ResPayload } from "../protocol.js";
import { UnityMcpError, makeError } from "../errors.js";

export const DEFAULT_SWEEP_MS = 250;
export const TOMBSTONE_TTL_MS = 60_000;
const ACK_TTL_MS = 10_000;

interface PendingEntry {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
  deadlineAt: number;
  onProgress?: (p: ProgressPayload) => void;
}

export interface PendingRegisterOptions {
  /** Absolute epoch ms deadline. */
  deadlineAt: number;
  onProgress?: (p: ProgressPayload) => void;
}

export interface PendingMapOptions {
  /** Called after a request is timed out locally (used to send a cancel frame). */
  onTimeout?: (id: string) => void;
  sweepMs?: number;
  tombstoneTtlMs?: number;
}

export type ResOutcome = "delivered" | "tombstoned" | "ack" | "unknown";

export interface PendingStats {
  lateDrops: number;
  unmatched: number;
  timeouts: number;
}

export class PendingMap {
  private readonly entries = new Map<string, PendingEntry>();
  private readonly tombstones = new Map<string, number>();
  private readonly expectedAcks = new Map<string, number>();
  private readonly sweepTimer: NodeJS.Timeout;
  private readonly tombstoneTtlMs: number;
  private disposed = false;
  readonly stats: PendingStats = { lateDrops: 0, unmatched: 0, timeouts: 0 };

  constructor(private readonly opts: PendingMapOptions = {}) {
    this.tombstoneTtlMs = opts.tombstoneTtlMs ?? TOMBSTONE_TTL_MS;
    this.sweepTimer = setInterval(() => this.sweep(), opts.sweepMs ?? DEFAULT_SWEEP_MS);
    this.sweepTimer.unref?.();
  }

  get size(): number {
    return this.entries.size;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  register(id: string, opts: PendingRegisterOptions): Promise<unknown> {
    if (this.disposed) {
      return Promise.reject(makeError("UNITY_UNREACHABLE", "pending map disposed"));
    }
    if (this.entries.has(id)) {
      return Promise.reject(makeError("PROTOCOL_ERROR", `duplicate req id ${id}`));
    }
    return new Promise<unknown>((resolve, reject) => {
      this.entries.set(id, {
        resolve,
        reject,
        deadlineAt: opts.deadlineAt,
        ...(opts.onProgress ? { onProgress: opts.onProgress } : {}),
      });
    });
  }

  /** Route a res frame to its waiter. Late frames on tombstoned ids are dropped. */
  resolveRes(id: string, payload: ResPayload): ResOutcome {
    const entry = this.entries.get(id);
    if (entry) {
      this.entries.delete(id);
      if (payload.ok) {
        entry.resolve(payload.result);
      } else {
        entry.reject(
          new UnityMcpError(
            payload.error ?? {
              code: "PROTOCOL_ERROR",
              message: "res with ok:false carried no error object",
              retryable: false,
            },
          ),
        );
      }
      return "delivered";
    }
    if (this.expectedAcks.delete(id)) return "ack";
    if (this.tombstones.has(id)) {
      this.stats.lateDrops += 1;
      console.error(`[unity-mcp] dropped late res for tombstoned id ${id}`);
      return "tombstoned";
    }
    this.stats.unmatched += 1;
    console.error(`[unity-mcp] dropped res for unknown id ${id}`);
    return "unknown";
  }

  /** Route a progress frame; returns false when the id is no longer pending. */
  progress(id: string, p: ProgressPayload): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    entry.onProgress?.(p);
    return true;
  }

  /**
   * Locally reject a pending id (abort/cancel path) and tombstone it so the
   * eventual res from the plugin is dropped. Returns whether id was pending.
   */
  cancelLocal(id: string, error: ErrorObj): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    this.entries.delete(id);
    this.tombstone(id);
    entry.reject(new UnityMcpError(error));
    return true;
  }

  /**
   * Mark an id (e.g. a cancel frame's own id) whose res is expected but
   * meaningless; it is swallowed silently instead of logging as unmatched.
   */
  expectAck(id: string): void {
    this.expectedAcks.set(id, Date.now() + ACK_TTL_MS);
  }

  /** Reject every in-flight request (connection loss). Returns count rejected. */
  failAll(error: ErrorObj): number {
    let n = 0;
    for (const [id, entry] of this.entries) {
      this.entries.delete(id);
      this.tombstone(id);
      entry.reject(new UnityMcpError(error));
      n += 1;
    }
    return n;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.sweepTimer);
    this.failAll({ code: "UNITY_UNREACHABLE", message: "client disposed", retryable: false });
    this.tombstones.clear();
    this.expectedAcks.clear();
  }

  private tombstone(id: string): void {
    this.tombstones.set(id, Date.now() + this.tombstoneTtlMs);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      if (now >= entry.deadlineAt) {
        this.entries.delete(id);
        this.tombstone(id);
        this.stats.timeouts += 1;
        entry.reject(makeError("TIMEOUT", "request timed out"));
        this.opts.onTimeout?.(id);
      }
    }
    for (const [id, expireAt] of this.tombstones) {
      if (now >= expireAt) this.tombstones.delete(id);
    }
    for (const [id, expireAt] of this.expectedAcks) {
      if (now >= expireAt) this.expectedAcks.delete(id);
    }
  }
}
