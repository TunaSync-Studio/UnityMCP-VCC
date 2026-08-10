// Single source for the server's own version (package.json mirrors it).
export const SERVER_VERSION = "2.6.3";

// Injected by esbuild at bundle time (F-13); absent when running from src
// (tsx dev / vitest), which is exactly the information "dev" conveys.
declare const __UNITY_MCP_BUILD_TS__: string | undefined;
export const SERVER_BUILD_TS: string =
  typeof __UNITY_MCP_BUILD_TS__ !== "undefined" ? __UNITY_MCP_BUILD_TS__ : "dev";

/** Process start marker: distinguishes two processes of the same build. */
export const SERVER_STARTED_AT: string = new Date().toISOString();

/**
 * F-13: identity block for unity_health_check. Answers "which server build
 * and which process am I actually talking to" from the response alone.
 */
export function serverIdentity(): {
  version: string;
  build: string;
  pid: number;
  startedAt: string;
} {
  return {
    version: SERVER_VERSION,
    build: SERVER_BUILD_TS,
    pid: process.pid,
    startedAt: SERVER_STARTED_AT,
  };
}
