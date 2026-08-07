// Framing layer: uint32 big-endian length prefix + UTF-8 JSON envelope.
// Pure byte handling, no sockets - unit-testable in isolation.

import type { Envelope } from "../protocol.js";
import { MAX_FRAME_BYTES } from "../protocol.js";

export const HEADER_BYTES = 4;

export type FrameErrorKind = "oversize" | "parse" | "shape";

/** Fatal framing error: the byte stream can no longer be trusted. */
export class FrameError extends Error {
  readonly kind: FrameErrorKind;

  constructor(kind: FrameErrorKind, message: string) {
    super(message);
    this.name = "FrameError";
    this.kind = kind;
  }
}

export function encodeFrame(env: Envelope): Buffer {
  const body = Buffer.from(JSON.stringify(env), "utf8");
  if (body.length > MAX_FRAME_BYTES) {
    throw new FrameError(
      "oversize",
      `frame body is ${body.length} bytes, exceeds max ${MAX_FRAME_BYTES}`,
    );
  }
  const out = Buffer.allocUnsafe(HEADER_BYTES + body.length);
  out.writeUInt32BE(body.length, 0);
  body.copy(out, HEADER_BYTES);
  return out;
}

export interface FrameDecoderHandlers {
  onFrame: (frame: Envelope) => void;
  /** Fatal: decoder goes dead and ignores all further input. */
  onError: (err: FrameError) => void;
}

function isEnvelope(x: unknown): x is Envelope {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.type === "string" && "payload" in o;
}

/**
 * Streaming frame decoder. Feed arbitrary Buffer chunks (split or coalesced);
 * emits parsed envelopes in order. Any framing violation is fatal because the
 * stream offset can no longer be recovered.
 */
export class FrameDecoder {
  private buf: Buffer = Buffer.alloc(0);
  private deadFlag = false;

  constructor(private readonly handlers: FrameDecoderHandlers) {}

  get dead(): boolean {
    return this.deadFlag;
  }

  push(chunk: Buffer): void {
    if (this.deadFlag) return;
    this.buf = this.buf.length === 0 ? chunk : Buffer.concat([this.buf, chunk]);
    for (;;) {
      if (this.deadFlag) return;
      if (this.buf.length < HEADER_BYTES) return;
      const len = this.buf.readUInt32BE(0);
      if (len > MAX_FRAME_BYTES) {
        this.fail(
          new FrameError("oversize", `frame header declares ${len} bytes, max ${MAX_FRAME_BYTES}`),
        );
        return;
      }
      if (this.buf.length < HEADER_BYTES + len) return;
      const body = this.buf.subarray(HEADER_BYTES, HEADER_BYTES + len);
      this.buf = this.buf.subarray(HEADER_BYTES + len);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body.toString("utf8"));
      } catch (err) {
        this.fail(
          new FrameError("parse", `frame body is not valid JSON: ${(err as Error).message}`),
        );
        return;
      }
      if (!isEnvelope(parsed)) {
        this.fail(new FrameError("shape", "frame JSON is not an envelope {id,type,payload}"));
        return;
      }
      this.handlers.onFrame(parsed);
    }
  }

  private fail(err: FrameError): void {
    this.deadFlag = true;
    this.buf = Buffer.alloc(0);
    this.handlers.onError(err);
  }
}
