// Ring buffer of Unity log lines fed from event {kind:"log"} frames.
// Queried by minimum level, regex, count and sinceId.

import { makeError } from "../errors.js";

export const LOG_RING_CAPACITY = 2000;

export interface LogEntry {
  /** Server-ring id: monotonic per server session (sinceId key). */
  id: number;
  /**
   * The plugin-side LogCapture id, when the event carried one. This is the id
   * space eval responses use in their logs[] - cross-reference with this, not
   * with the server-ring id (F-7: the two spaces are intentionally distinct
   * because plugin ids reset on domain reload).
   */
  pluginId?: number;
  ts: string;
  level: string;
  message: string;
  stack?: string;
}

export interface LogQuery {
  /** Minimum severity: debug < warning < error. */
  level?: string;
  regex?: string;
  count?: number;
  sinceId?: number;
}

const LEVEL_RANK: Record<string, number> = {
  debug: 0,
  log: 0,
  info: 0,
  warning: 1,
  warn: 1,
  error: 2,
  exception: 2,
  assert: 2,
};

function rankOf(level: string): number {
  return LEVEL_RANK[level.toLowerCase()] ?? 0;
}

export class LogRing {
  private readonly entries: LogEntry[] = [];
  private seq = 0;
  private total = 0;

  constructor(private readonly capacity: number = LOG_RING_CAPACITY) {}

  /** Total pushed over the ring's lifetime (distinguishes empty vs filtered). */
  get totalPushed(): number {
    return this.total;
  }

  get lastId(): number {
    return this.seq;
  }

  get size(): number {
    return this.entries.length;
  }

  /** Defensive extraction: the event data shape is plugin-defined. */
  push(data: unknown): LogEntry {
    const d = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
    const level = typeof d.level === "string" ? d.level.toLowerCase() : "info";
    const message = typeof d.message === "string" ? d.message : JSON.stringify(data);
    // The plugin's LogCapture.Entry serializes its stack as "firstStackLine";
    // accept a plain "stack" too for robustness. (Reading only d.stack meant
    // ring entries never carried a stack and stack-regex never matched.)
    const stackRaw = d.firstStackLine ?? d.stack;
    const stack = typeof stackRaw === "string" && stackRaw.length > 0 ? stackRaw : undefined;
    const ts = typeof d.ts === "string" ? d.ts : new Date().toISOString();
    const pluginId = typeof d.id === "number" && Number.isFinite(d.id) ? d.id : undefined;
    const entry: LogEntry = {
      id: ++this.seq,
      ...(pluginId !== undefined ? { pluginId } : {}),
      ts,
      level,
      message,
      ...(stack !== undefined ? { stack } : {}),
    };
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.shift();
    this.total += 1;
    return entry;
  }

  query(q: LogQuery = {}): LogEntry[] {
    let re: RegExp | null = null;
    if (q.regex !== undefined) {
      try {
        re = new RegExp(q.regex, "i");
      } catch (err) {
        throw makeError("INVALID_PARAMS", `invalid regex: ${(err as Error).message}`);
      }
    }
    const minRank = q.level !== undefined ? rankOf(q.level) : 0;
    const sinceId = q.sinceId ?? 0;
    const filtered = this.entries.filter(
      (e) =>
        e.id > sinceId &&
        rankOf(e.level) >= minRank &&
        (re === null || re.test(e.message) || (e.stack !== undefined && re.test(e.stack))),
    );
    const count = q.count !== undefined && q.count > 0 ? q.count : 100;
    return filtered.slice(-count);
  }

  clear(): void {
    this.entries.length = 0;
  }
}
