// FrameEncoder/FrameDecoder: split, coalesced, jumbo and garbage streams.

import { describe, expect, it, vi } from "vitest";
import { FrameDecoder, FrameError, HEADER_BYTES, encodeFrame } from "../src/transport/frame.js";
import { MAX_FRAME_BYTES, type Envelope } from "../src/protocol.js";

function collect(): {
  frames: Envelope[];
  errors: FrameError[];
  decoder: FrameDecoder;
} {
  const frames: Envelope[] = [];
  const errors: FrameError[] = [];
  const decoder = new FrameDecoder({
    onFrame: (f) => frames.push(f),
    onError: (e) => errors.push(e),
  });
  return { frames, errors, decoder };
}

function env(id: string, extra?: Record<string, unknown>): Envelope {
  return { id, type: "req", payload: { method: "sys.echo", params: extra ?? { id } } };
}

describe("encodeFrame", () => {
  it("writes a uint32 BE length header followed by UTF-8 JSON", () => {
    const e = env("a1");
    const buf = encodeFrame(e);
    const len = buf.readUInt32BE(0);
    expect(len).toBe(buf.length - HEADER_BYTES);
    expect(JSON.parse(buf.subarray(HEADER_BYTES).toString("utf8"))).toEqual(e);
  });

  it("round-trips multibyte UTF-8 payloads by byte length, not char length", () => {
    const e = env("utf8", { text: "ééé-☃" });
    const { frames, errors, decoder } = collect();
    decoder.push(encodeFrame(e));
    expect(errors).toHaveLength(0);
    expect(frames).toEqual([e]);
  });
});

describe("FrameDecoder", () => {
  it("decodes a frame delivered byte by byte", () => {
    const e = env("split-1");
    const buf = encodeFrame(e);
    const { frames, errors, decoder } = collect();
    for (let i = 0; i < buf.length; i++) {
      decoder.push(buf.subarray(i, i + 1));
    }
    expect(errors).toHaveLength(0);
    expect(frames).toEqual([e]);
  });

  it("decodes a header split across chunks", () => {
    const e = env("split-header");
    const buf = encodeFrame(e);
    const { frames, decoder } = collect();
    decoder.push(buf.subarray(0, 2));
    decoder.push(buf.subarray(2, 5));
    decoder.push(buf.subarray(5));
    expect(frames).toEqual([e]);
  });

  it("decodes multiple coalesced frames from a single chunk, in order", () => {
    const es = [env("c1"), env("c2"), env("c3")];
    const chunk = Buffer.concat(es.map(encodeFrame));
    const { frames, errors, decoder } = collect();
    decoder.push(chunk);
    expect(errors).toHaveLength(0);
    expect(frames).toEqual(es);
  });

  it("decodes a coalesced chunk that ends with a partial frame", () => {
    const a = env("p1");
    const b = env("p2");
    const bufB = encodeFrame(b);
    const { frames, decoder } = collect();
    decoder.push(Buffer.concat([encodeFrame(a), bufB.subarray(0, 7)]));
    expect(frames).toEqual([a]);
    decoder.push(bufB.subarray(7));
    expect(frames).toEqual([a, b]);
  });

  it("goes fatally dead on a jumbo length header (> MAX_FRAME_BYTES)", () => {
    const header = Buffer.alloc(HEADER_BYTES);
    header.writeUInt32BE(MAX_FRAME_BYTES + 1, 0);
    const { frames, errors, decoder } = collect();
    decoder.push(header);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.kind).toBe("oversize");
    expect(decoder.dead).toBe(true);
    // Further input is ignored once dead.
    decoder.push(encodeFrame(env("after-death")));
    expect(frames).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it("goes fatally dead on a well-framed garbage (non-JSON) body", () => {
    const body = Buffer.from("not json at all", "utf8");
    const buf = Buffer.alloc(HEADER_BYTES + body.length);
    buf.writeUInt32BE(body.length, 0);
    body.copy(buf, HEADER_BYTES);
    const { errors, decoder } = collect();
    decoder.push(buf);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.kind).toBe("parse");
    expect(decoder.dead).toBe(true);
  });

  it("reassembles a large chunked frame with one join, not one per chunk", () => {
    // 4 MiB body over 64 KiB socket chunks: the old decoder re-concatenated
    // the whole backlog per chunk (quadratic; 60 MiB took ~15 s -> TIMEOUT).
    const e = env("big", { blob: "x".repeat(4 * 1024 * 1024) });
    const buf = encodeFrame(e);
    const { frames, errors, decoder } = collect();
    const concat = vi.spyOn(Buffer, "concat");
    try {
      for (let off = 0; off < buf.length; off += 64 * 1024) {
        decoder.push(buf.subarray(off, off + 64 * 1024));
      }
      expect(concat.mock.calls.length).toBeLessThanOrEqual(2);
    } finally {
      concat.mockRestore();
    }
    expect(errors).toHaveLength(0);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual(e);
  });

  it("keeps order when onFrame re-enters push", () => {
    const es = [env("r1"), env("r2"), env("r3")];
    const bufs = es.map(encodeFrame);
    const frames: Envelope[] = [];
    const decoder: FrameDecoder = new FrameDecoder({
      onFrame: (f) => {
        frames.push(f);
        if (f.id === "r1") decoder.push(bufs[2] as Buffer); // arrives while r2 is still buffered
      },
      onError: (err) => {
        throw err;
      },
    });
    decoder.push(Buffer.concat([bufs[0] as Buffer, bufs[1] as Buffer]));
    expect(frames.map((f) => f.id)).toEqual(["r1", "r2", "r3"]);
  });

  it("goes fatally dead on valid JSON that is not an envelope", () => {
    const body = Buffer.from(JSON.stringify({ hello: "world" }), "utf8");
    const buf = Buffer.alloc(HEADER_BYTES + body.length);
    buf.writeUInt32BE(body.length, 0);
    body.copy(buf, HEADER_BYTES);
    const { errors, decoder } = collect();
    decoder.push(buf);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.kind).toBe("shape");
  });
});
