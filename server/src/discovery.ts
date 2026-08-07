// Registry discovery: scan %LOCALAPPDATA%\UnityMCP\registry\*.json for live
// plugin listeners and resolve a project selector to exactly one entry.

import * as fs from "node:fs";
import * as path from "node:path";
import { normalizeProjectPath, type RegistryEntry } from "./protocol.js";
import { makeError } from "./errors.js";
import type { Config } from "./config.js";

/** Entries whose registry file mtime is older than this are treated as dead. */
export const STALE_REGISTRY_MS = 150_000;
export const REGISTRY_SCHEMA_VERSION = 1;

// "unresponsive" = pid alive but registry heartbeat stalled: a blocked main
// thread (modal dialog, long import, Thread.Sleep) or a hung editor. The
// process usually still listens on its port. (F-11: was labeled "stale",
// which read as "no Unity found" while the editor was merely blocked.)
export type DeadReason = "schema_mismatch" | "pid_dead" | "unresponsive";

export interface DiscoveredProject {
  entry: RegistryEntry;
  file: string;
  mtimeMs: number;
  alive: boolean;
  reason?: DeadReason;
}

export function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but is not ours - still alive.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function isRegistryEntry(x: unknown): x is RegistryEntry {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.schemaVersion === "number" &&
    typeof o.port === "number" &&
    typeof o.projectPath === "string" &&
    typeof o.projectName === "string" &&
    typeof o.pid === "number"
  );
}

/** Read every registry json; malformed files are skipped, dead ones flagged. */
export function scanRegistry(cfg: Config, now: number = Date.now()): DiscoveredProject[] {
  let names: string[];
  try {
    names = fs.readdirSync(cfg.registryDir);
  } catch {
    return [];
  }
  const out: DiscoveredProject[] = [];
  for (const name of names) {
    if (!name.toLowerCase().endsWith(".json")) continue;
    const file = path.join(cfg.registryDir, name);
    let mtimeMs: number;
    let parsed: unknown;
    try {
      mtimeMs = fs.statSync(file).mtimeMs;
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    if (!isRegistryEntry(parsed)) continue;
    let alive = true;
    let reason: DeadReason | undefined;
    if (parsed.schemaVersion !== REGISTRY_SCHEMA_VERSION) {
      alive = false;
      reason = "schema_mismatch";
    } else if (!pidAlive(parsed.pid)) {
      alive = false;
      reason = "pid_dead";
    } else if (now - mtimeMs > STALE_REGISTRY_MS) {
      alive = false;
      reason = "unresponsive";
    }
    out.push({ entry: parsed, file, mtimeMs, alive, ...(reason ? { reason } : {}) });
  }
  return out;
}

interface Candidate {
  projectPath: string;
  projectName: string;
  port: number;
  pid: number;
  unityVersion: string;
  /** Absent = alive; otherwise why the entry is not connectable right now. */
  reason?: DeadReason;
}

function candidateOf(e: RegistryEntry, reason?: DeadReason): Candidate {
  return {
    projectPath: e.projectPath,
    projectName: e.projectName,
    port: e.port,
    pid: e.pid,
    unityVersion: e.unityVersion,
    ...(reason !== undefined ? { reason } : {}),
  };
}

function matchesSelector(e: RegistryEntry, sel: string): boolean {
  const normSel = normalizeProjectPath(sel);
  return (
    normalizeProjectPath(e.projectPath) === normSel ||
    normalizeProjectPath(e.projectPath).includes(normSel) ||
    e.projectName.toLowerCase().includes(sel.toLowerCase())
  );
}

/**
 * F-12: an editor that EXISTS but is unresponsive (blocked main thread) must
 * not degrade into "no running Unity Editor". Every non-health tool resolves
 * through here, so this is the shared place to say the truth: BUSY_MODAL,
 * retryable, with the process identity attached.
 */
function throwUnresponsive(hits: DiscoveredProject[], now: number): never {
  const first = hits[0];
  if (!first) throw new Error("throwUnresponsive called with no hits");
  const e = first.entry;
  const ageS = Math.round((now - first.mtimeMs) / 1000);
  throw makeError(
    "BUSY_MODAL",
    `Unity editor for '${e.projectName}' is running (pid ${e.pid}) but unresponsive: ` +
      `registry heartbeat stalled for ~${ageS} s (blocked main thread - modal dialog, ` +
      "long import, sleep - or a hung editor). Retry once the editor unblocks.",
    {
      retryable: true,
      detail: {
        candidates: hits.map((h) => candidateOf(h.entry, h.reason)),
        heartbeatAgeMs: Math.round(now - first.mtimeMs),
      },
    },
  );
}

/**
 * Resolve a selector to exactly one live registry entry.
 * Order: exact normalized path match -> substring match (path or name) ->
 * single-alive default. Throws PROJECT_AMBIGUOUS / PROJECT_NOT_FOUND.
 */
export function resolveProject(cfg: Config, selector?: string): RegistryEntry {
  const sel = selector ?? cfg.projectSelector;
  const now = Date.now();
  const scanned = scanRegistry(cfg, now);
  const alive = scanned.filter((d) => d.alive).map((d) => d.entry);
  const unresponsive = scanned.filter((d) => !d.alive && d.reason === "unresponsive");

  if (sel !== undefined) {
    const normSel = normalizeProjectPath(sel);
    const exact = alive.find((e) => normalizeProjectPath(e.projectPath) === normSel);
    if (exact) return exact;

    const needle = sel.toLowerCase();
    const sub = alive.filter(
      (e) =>
        normalizeProjectPath(e.projectPath).includes(normSel) ||
        e.projectName.toLowerCase().includes(needle),
    );
    if (sub.length === 1 && sub[0]) return sub[0];
    if (sub.length > 1) {
      throw makeError("PROJECT_AMBIGUOUS", `selector "${sel}" matches ${sub.length} projects`, {
        detail: { candidates: sub.map((e) => candidateOf(e)) },
      });
    }
    // No live match - but a matching editor that is merely blocked is a very
    // different situation from "not found" (F-12).
    const blockedHits = unresponsive.filter((d) => matchesSelector(d.entry, sel));
    if (blockedHits.length > 0) throwUnresponsive(blockedHits, now);
    throw makeError("PROJECT_NOT_FOUND", `no running Unity project matches "${sel}"`, {
      detail: {
        candidates: scanned.map((d) => candidateOf(d.entry, d.reason)),
        registryDir: cfg.registryDir,
      },
    });
  }

  if (alive.length === 1 && alive[0]) return alive[0];
  if (alive.length === 0) {
    if (unresponsive.length > 0) throwUnresponsive(unresponsive, now);
    throw makeError("PROJECT_NOT_FOUND", "no running Unity Editor with the UnityMCP plugin found", {
      detail: {
        candidates: scanned.map((d) => candidateOf(d.entry, d.reason)),
        registryDir: cfg.registryDir,
      },
    });
  }
  throw makeError(
    "PROJECT_AMBIGUOUS",
    `${alive.length} Unity projects are running; pass a project selector`,
    { detail: { candidates: alive.map((e) => candidateOf(e)) } },
  );
}
