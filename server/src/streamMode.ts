// Streaming mode (配信モード): one env var locks every destructive / publishing
// tool and masks user-identifying filesystem paths in tool output, so a
// screen-shared session cannot leak paths or fire irreversible operations.
//
// Scope: this is a server-side gate. It covers everything an MCP client can
// reach through this server. A process talking TCP to the plugin directly is
// not covered (the per-user token still limits that to the same OS user).
//
// UNITY_MCP_STREAM_MODE=1        enable
// UNITY_MCP_STREAM_MASK=a;b;c    extra literal terms to mask (project names etc.)

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { serverIdentity } from "./version.js";

export interface StreamModeState {
  enabled: boolean;
  /** Extra literal terms replaced with "****" in all tool output. */
  masks: string[];
}

export const STREAM_DISABLED: StreamModeState = { enabled: false, masks: [] };

const TRUTHY = new Set(["1", "true", "on", "yes"]);

export function loadStreamMode(env: NodeJS.ProcessEnv = process.env): StreamModeState {
  const enabled = TRUTHY.has((env.UNITY_MCP_STREAM_MODE ?? "").trim().toLowerCase());
  const masks = (env.UNITY_MCP_STREAM_MASK ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return { enabled, masks };
}

/** Tools fully locked while streaming (destructive or publishing). */
export const STREAM_LOCKED_TOOLS: ReadonlySet<string> = new Set([
  "execute_editor_command", // arbitrary C# = arbitrary side effects
  "ndmf_bake_run", // writes assets
  "vrc_upload", // publishing path (locked even for dry_run: keep the surface zero)
  "vpm_manage", // modifies projects / shells out (locked whole: keep the surface zero)
  "unity_editor", // process control + enumerates every project on the machine
  "asset_import", // writes into the project (can overwrite assets)
  "vcc_project", // F-27: enumerates every project on the machine (WIP names leak on stream)
]);

/**
 * Returns a human-readable lock reason when the call must be refused under
 * stream mode, or null when it may proceed.
 */
export function streamLockReason(
  toolName: string,
  args: Record<string, unknown>,
  state: StreamModeState,
): string | null {
  if (!state.enabled) return null;
  if (STREAM_LOCKED_TOOLS.has(toolName)) {
    return `tool '${toolName}' is locked while streaming mode is on`;
  }
  if (toolName === "session_lease" && args.action === "takeover") {
    return "session_lease takeover is locked while streaming mode is on";
  }
  return null;
}

export function streamLockedResult(reason: string): CallToolResult {
  const message =
    `${reason}. ` +
    "UNITY_MCP_STREAM_MODE is set for this server process (streaming safety: " +
    "destructive/publishing tools are disabled and paths are masked). " +
    "To unlock, unset UNITY_MCP_STREAM_MODE and restart the MCP server.";
  // F-17: same server identity block as fail() responses.
  return {
    content: [
      { type: "text", text: `[STREAM_MODE_LOCKED] ${message}` },
      {
        type: "text",
        text: JSON.stringify(
          {
            error: { code: "STREAM_MODE_LOCKED", message, retryable: false },
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

// ---- path / term masking ----------------------------------------------------

// <drive>:\Users\<name> (any slash direction, tolerates JSON-escaped "\\").
// Only the user-name path segment is masked; bare words are never touched, so
// e.g. "TOKEN" can never be mangled by the default rules.
const USER_DIR_RE = /([A-Za-z]:)([\\/]+Users[\\/]+)[^\\/:*?"<>|\s]+/g;

function jsonEscaped(term: string): string {
  return term.split("\\").join("\\\\");
}

export function maskText(text: string, state: StreamModeState): string {
  if (!state.enabled) return text;
  let out = text.replace(USER_DIR_RE, (_m, drive: string, mid: string) => `${drive}${mid}****`);
  for (const term of state.masks) {
    if (term.length === 0) continue;
    out = out.split(term).join("****");
    const esc = jsonEscaped(term);
    if (esc !== term) out = out.split(esc).join("****");
  }
  return out;
}

/** Mask every text content entry of a tool result (errors included). */
export function maskResult(res: CallToolResult, state: StreamModeState): CallToolResult {
  if (!state.enabled) return res;
  const content = res.content.map((c) =>
    c.type === "text" ? { ...c, text: maskText(c.text, state) } : c,
  );
  return { ...res, content };
}
