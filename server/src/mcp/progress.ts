// Bridge from plugin progress frames to MCP notifications/progress.
// Throttled to 1/s; a keepalive tick fires every 10 s while a call is in
// flight so slow Unity operations do not look hung to the MCP client.

import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import type { ProgressPayload } from "../protocol.js";

export type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export const PROGRESS_THROTTLE_MS = 1_000;
export const PROGRESS_KEEPALIVE_MS = 10_000;

export interface ProgressBridge {
  onProgress: (p: ProgressPayload) => void;
  /** Must be called when the tool call settles (stops the keepalive timer). */
  done: () => void;
}

const NOOP_BRIDGE: ProgressBridge = { onProgress: () => undefined, done: () => undefined };

export function makeProgressBridge(extra: ToolExtra): ProgressBridge {
  const token = extra._meta?.progressToken;
  if (token === undefined) return NOOP_BRIDGE;

  let lastSentAt = 0;
  let counter = 0;
  let lastPct: number | undefined;
  let lastMessage: string | undefined;
  let closed = false;

  const send = (message?: string): void => {
    if (closed) return;
    lastSentAt = Date.now();
    counter += 1;
    const params =
      lastPct !== undefined
        ? {
            progressToken: token,
            progress: lastPct,
            total: 100,
            ...(message !== undefined ? { message } : {}),
          }
        : { progressToken: token, progress: counter, ...(message !== undefined ? { message } : {}) };
    extra
      .sendNotification({ method: "notifications/progress", params })
      .catch((err: unknown) =>
        console.error(`[unity-mcp] progress notification failed: ${String(err)}`),
      );
  };

  const keepalive = setInterval(() => {
    if (Date.now() - lastSentAt >= PROGRESS_KEEPALIVE_MS - 500) {
      send(lastMessage ?? "still working");
    }
  }, PROGRESS_KEEPALIVE_MS);
  keepalive.unref?.();

  return {
    onProgress: (p) => {
      if (typeof p.pct === "number") lastPct = p.pct;
      if (typeof p.message === "string") lastMessage = p.message;
      if (Date.now() - lastSentAt >= PROGRESS_THROTTLE_MS) send(p.message ?? p.phase);
    },
    done: () => {
      closed = true;
      clearInterval(keepalive);
    },
  };
}
