// Human arm gate for real VRChat uploads.
//
// confirm:true alone is an AI-settable parameter, so it proves intent of the
// *caller*, not of the human operator. A REAL vrc_upload therefore also
// requires a one-shot arm file that only the human operator is supposed to
// create (tools\arm-vrc-upload.bat). The file expires after a TTL.
//
// Who consumes it: the Unity plugin, and only the plugin. Right before a real
// upload starts it checks and deletes the arm under an exclusive claim lock
// (UploadArmClaim.cs), so one arm buys exactly one attempt even when attempts
// race (L-3) and a client driving the plugin directly cannot skip it (M-1). The server only
// pre-checks the arm (read-only) to refuse early without submitting a job, and
// submits real uploads only to plugins that advertise ARM_CLAIM_FEATURE.
// (Through 2.6.8 the server consumed the arm before submitting the job while
// 2.6.7+ plugins also required it, so every real upload was refused.)
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
import { SERVER_VERSION, serverIdentity } from "./version.js";

export const DEFAULT_ARM_TTL_MS = 30 * 60 * 1000;
/** An arm stamped further ahead than this is refused (clock moved back). */
export const ARM_FUTURE_TOLERANCE_MS = 60 * 1000;

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
  // Same rule as the plugin's UploadArmClaim: a future-dated arm (armed, then
  // the clock was set back) would otherwise outlive its TTL.
  if (ageMs < -ARM_FUTURE_TOLERANCE_MS) {
    return {
      armed: false,
      file,
      detail:
        `arm file timestamp is ${Math.round(-ageMs / 60000)} min in the future ` +
        "(was the clock changed?)",
    };
  }
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

/**
 * welcome.features entry of a plugin whose vrc.upload claims (consumes) the
 * arm itself. The server never consumes the arm, so it must not submit a real
 * upload to a plugin without this feature: <= 2.6.6 would upload without
 * using the arm up, 2.6.7-2.6.8 would refuse it.
 */
export const ARM_CLAIM_FEATURE = "vrcUploadArmClaim";

export function armRequiredResult(arm: ArmCheck): CallToolResult {
  const message =
    `A real vrc_upload additionally requires a human-created ` +
    `one-shot arm file: ${arm.file} (${arm.detail}). ` +
    "The human operator arms it by running tools\\arm-vrc-upload.bat " +
    "(TTL 30 min, consumed by the Unity plugin when the upload starts). If " +
    "you are an AI agent: do NOT create this file yourself - stop and ask the " +
    "operator to arm, then retry.";
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

/**
 * Refusal for a real upload to a plugin without ARM_CLAIM_FEATURE. Nothing was
 * submitted and the arm was not touched, so it stays usable until its TTL
 * once the plugin is updated.
 */
export function armClaimUnsupportedResult(pluginVersion: string | null): CallToolResult {
  const message =
    `The connected Unity plugin (com.tunasync.unity-mcp ${pluginVersion ?? "unknown version"}) ` +
    `does not advertise the "${ARM_CLAIM_FEATURE}" feature: it does not consume the ` +
    "vrc_upload arm itself, which this server requires for a real upload. Update the " +
    "Unity package to the release that ships with this server " +
    `(tunasync-unity-mcp ${SERVER_VERSION}) and retry. Nothing was submitted and the ` +
    "arm file was not used; dry_run:true still works.";
  return {
    content: [
      { type: "text", text: `[PLUGIN_UPDATE_REQUIRED] ${message}` },
      {
        type: "text",
        text: JSON.stringify(
          {
            error: {
              code: "PLUGIN_UPDATE_REQUIRED",
              message,
              retryable: false,
              detail: { pluginVersion, requiredFeature: ARM_CLAIM_FEATURE },
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
