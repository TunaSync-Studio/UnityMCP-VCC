// Human arm gate for real VRChat uploads.
//
// confirm:true alone is an AI-settable parameter, so it proves intent of the
// *caller*, not of the human operator. A REAL vrc_upload therefore also
// requires a one-shot arm file that only the human operator is supposed to
// create (tools\arm-vrc-upload.bat). The file expires after a TTL and is
// consumed (deleted, best-effort) once a real upload attempt is over, so one
// arm buys one armed attempt; if the delete is racing/locked the TTL still
// bounds it.
//
// The plugin (2.6.7+, M-1) independently re-reads the same file when the
// vrc.upload job starts, so the file must still exist at that point: the arm
// stays in place for the duration of the attempt and is deleted afterwards.
// (2.6.7/2.6.8 deleted it before job.submit, which made the plugin refuse
// every real upload with "arm file not found".)
//
// This is an intent marker, not a cryptographic barrier: any process with
// filesystem access could technically create the file. Its purpose is to keep
// "publish to VRChat" out of the AI's normal, unattended toolset - an agent
// must stop and ask the operator to arm.
//
// UNITY_MCP_ARM_FILE     override the arm file location
// UNITY_MCP_ARM_TTL_MIN  override the TTL in minutes (default 30)

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "./config.js";
import { pidAlive } from "./discovery.js";
import { serverIdentity } from "./version.js";

export const DEFAULT_ARM_TTL_MS = 30 * 60 * 1000;

export interface ArmCheck {
  armed: boolean;
  file: string;
  detail: string;
}

export function armFilePath(cfg: Pick<Config, "armFile">): string {
  if (cfg.armFile !== undefined && cfg.armFile.length > 0) return cfg.armFile;
  const localAppData =
    process.env.LOCALAPPDATA && process.env.LOCALAPPDATA.length > 0
      ? process.env.LOCALAPPDATA
      : path.join(os.homedir(), "AppData", "Local");
  return path.join(localAppData, "UnityMCP", "arm", "vrc-upload.arm");
}

export function checkArm(
  cfg: Pick<Config, "armFile" | "armTtlMs">,
  now: number = Date.now(),
): ArmCheck {
  const file = armFilePath(cfg);
  const ttlMs = cfg.armTtlMs ?? DEFAULT_ARM_TTL_MS;
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return { armed: false, file, detail: "arm file not found" };
  }
  const ageMs = now - st.mtimeMs;
  if (ageMs > ttlMs) {
    return {
      armed: false,
      file,
      detail:
        `arm file expired (age ${Math.round(ageMs / 60000)} min > ` +
        `TTL ${Math.round(ttlMs / 60000)} min)`,
    };
  }
  return { armed: true, file, detail: `armed (age ${Math.round(ageMs / 1000)} s)` };
}

/** An exclusive claim on the current arm, held for one upload attempt. */
export interface ArmClaim {
  /** The attempt reached the plugin: delete the arm (one-shot) and the lock. */
  consume(): void;
  /** Nothing was sent to the plugin: keep the arm, drop only the lock. */
  release(): void;
}

export function armLockPath(file: string): string {
  return `${file}.lock`;
}

/**
 * One-shot: claim the arm for one attempt WITHOUT removing it (the plugin
 * re-checks the same file when the job starts). L-3 (audit): two concurrent
 * calls must never both ride one arm - an O_EXCL side lock (<arm>.lock) lets
 * exactly one caller win; the loser gets null and must answer ARM_REQUIRED.
 * A lock left behind by a dead process (crash mid-upload) or older than the
 * arm TTL is stale and is taken over.
 */
export function claimArm(
  file: string,
  cfg: Pick<Config, "armTtlMs"> = {},
  now: number = Date.now(),
): ArmClaim | null {
  const lock = armLockPath(file);
  let armedAtMs: number;
  try {
    armedAtMs = fs.statSync(file).mtimeMs;
  } catch {
    return null; // disarmed between the check and the claim
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, at: new Date(now).toISOString() }), {
        flag: "wx",
      });
      return makeClaim(file, lock, armedAtMs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") return null;
      if (attempt > 0 || !lockIsStale(lock, cfg.armTtlMs ?? DEFAULT_ARM_TTL_MS, now)) return null;
      try {
        fs.unlinkSync(lock);
      } catch {
        // another caller removed or re-took it first; the retry decides
      }
    }
  }
  return null;
}

function lockIsStale(lock: string, ttlMs: number, now: number): boolean {
  let st: fs.Stats;
  try {
    st = fs.statSync(lock);
  } catch {
    return true; // vanished: nothing to wait for
  }
  if (now - st.mtimeMs > ttlMs) return true; // outlived any arm it protected
  let owner: unknown;
  try {
    owner = (JSON.parse(fs.readFileSync(lock, "utf8")) as { pid?: unknown }).pid;
  } catch {
    // Unparseable: a writer may be between create and write - only an old
    // one is abandoned.
    return now - st.mtimeMs > 5_000;
  }
  return typeof owner !== "number" || !pidAlive(owner);
}

function makeClaim(file: string, lock: string, armedAtMs: number): ArmClaim {
  let done = false;
  const dropLock = (): void => {
    try {
      fs.unlinkSync(lock);
    } catch {
      // already gone (stale-lock takeover by a later attempt)
    }
  };
  return {
    consume: () => {
      if (done) return;
      done = true;
      try {
        // Re-armed while this attempt ran (new mtime): that arm belongs to
        // the NEXT attempt, leave it.
        if (fs.statSync(file).mtimeMs === armedAtMs) fs.unlinkSync(file);
      } catch {
        // already gone; the TTL bounds anything left behind
      }
      dropLock();
    },
    release: () => {
      if (done) return;
      done = true;
      dropLock();
    },
  };
}

export function armRequiredResult(arm: ArmCheck): CallToolResult {
  const message =
    `A real vrc_upload additionally requires a human-created ` +
    `one-shot arm file: ${arm.file} (${arm.detail}). ` +
    "The human operator arms it by running tools\\arm-vrc-upload.bat " +
    "(TTL 30 min, consumed per attempt). If you are an AI agent: do NOT " +
    "create this file yourself - stop and ask the operator to arm, then retry.";
  // F-17: hand-built early-return errors carry the same server identity block
  // as fail() responses - this is exactly the moment a caller needs to know
  // which server/build refused the upload.
  return {
    content: [
      { type: "text", text: `[ARM_REQUIRED] ${message}` },
      {
        type: "text",
        text: JSON.stringify(
          {
            error: {
              code: "ARM_REQUIRED",
              message,
              retryable: false,
              detail: { file: arm.file, state: arm.detail },
            },
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
