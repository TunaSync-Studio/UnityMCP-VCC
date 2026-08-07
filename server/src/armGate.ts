// Human arm gate for real VRChat uploads.
//
// confirm:true alone is an AI-settable parameter, so it proves intent of the
// *caller*, not of the human operator. A REAL vrc_upload therefore also
// requires a one-shot arm file that only the human operator is supposed to
// create (tools\arm-vrc-upload.bat). The file expires after a TTL and is
// consumed (deleted, best-effort) when a real upload attempt starts, so one
// arm buys one armed attempt window; if the delete is racing/locked the TTL
// still bounds it.
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

/** One-shot: delete the arm file when an attempt starts. Best-effort. */
export function consumeArm(file: string): void {
  try {
    fs.unlinkSync(file);
  } catch {
    // already gone / locked: the TTL still bounds the window
  }
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
