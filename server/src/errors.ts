// Error helper on top of the protocol ErrorObj contract.
// protocol.ts is the type contract and stays untouched; helpers live here.

import type { ErrorCode, ErrorObj } from "./protocol.js";

/** Error carrying a wire-shaped ErrorObj; everything user-facing flows through this. */
export class UnityMcpError extends Error {
  readonly obj: ErrorObj;

  constructor(obj: ErrorObj) {
    super(`[${obj.code}] ${obj.message}`);
    this.name = "UnityMcpError";
    this.obj = obj;
  }

  get code(): ErrorCode {
    return this.obj.code;
  }

  get retryable(): boolean {
    return this.obj.retryable;
  }
}

export function makeError(
  code: ErrorCode,
  message: string,
  extra?: Partial<Omit<ErrorObj, "code" | "message">>,
): UnityMcpError {
  return new UnityMcpError({
    code,
    message,
    retryable: extra?.retryable ?? false,
    ...(extra?.detail !== undefined ? { detail: extra.detail } : {}),
    ...(extra?.unityStack !== undefined ? { unityStack: extra.unityStack } : {}),
    ...(extra?.consoleErrors !== undefined ? { consoleErrors: extra.consoleErrors } : {}),
    ...(extra?.diagnostics !== undefined ? { diagnostics: extra.diagnostics } : {}),
  });
}

/** Wrap any thrown value into a UnityMcpError without losing an existing one. */
export function toUnityMcpError(err: unknown): UnityMcpError {
  if (err instanceof UnityMcpError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return makeError("HANDLER_EXCEPTION", message);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
