// Correlation: parallel same-method calls each get their own result; a timed
// out id is tombstoned, its cancel frame goes out, and the late res is dropped.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { UnityMcpError } from "../src/errors.js";
import { UnityClient } from "../src/unity/client.js";
import { MockPlugin, type MockHandlerContext } from "./mock-plugin.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(cond: () => boolean, timeoutMs = 5000, stepMs = 20): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await sleep(stepMs);
  }
}

describe("correlation", () => {
  let tmp: string;
  let cfg: Config;
  let mock: MockPlugin;
  let client: UnityClient | null = null;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-corr-"));
    cfg = { projectSelector: undefined, registryDir: tmp, defaultTimeoutMs: 5000 };
  });

  afterEach(async () => {
    client?.dispose();
    client = null;
    await mock.stop();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("routes 10 parallel same-method calls to their own results", async () => {
    mock = new MockPlugin({
      registryDir: tmp,
      handlers: {
        "test.delay": async (params: unknown, ctx: MockHandlerContext) => {
          const p = params as { value: number; delayMs: number };
          await ctx.delay(p.delayMs);
          return { value: p.value };
        },
      },
    });
    await mock.start();
    client = new UnityClient({ config: cfg, pendingSweepMs: 50 });

    // Stagger delays so responses come back in REVERSE submission order;
    // correlation by id must still route each to its own caller.
    const calls = Array.from({ length: 10 }, (_, i) =>
      client!.call("test.delay", { value: i, delayMs: (9 - i) * 25 + 10 }),
    );
    const results = (await Promise.all(calls)) as Array<{ value: number }>;
    results.forEach((r, i) => expect(r.value).toBe(i));
    expect(mock.received.reqs.filter((r) => r.method === "test.delay")).toHaveLength(10);
  });

  it("times out, sends cancel, tombstones, and drops the late res", async () => {
    mock = new MockPlugin({
      registryDir: tmp,
      ignoreCancel: true, // let the slow handler finish so a real late res arrives
      handlers: {
        "test.slow": async (params: unknown, ctx: MockHandlerContext) => {
          await ctx.delay(700);
          return { late: true, params };
        },
      },
    });
    await mock.start();
    client = new UnityClient({ config: cfg, pendingSweepMs: 25 });

    // Warm the connection so the timeout applies to an in-flight req.
    await client.call("sys.echo", { warm: true });

    const err = await client.call("test.slow", {}, { timeoutMs: 100 }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(UnityMcpError);
    expect((err as UnityMcpError).code).toBe("TIMEOUT");
    expect(client.stats.timeouts).toBe(1);

    const slowReq = mock.received.reqs.find((r) => r.method === "test.slow");
    expect(slowReq).toBeDefined();

    // The client must have fired a cancel frame for the timed-out id.
    await waitFor(() => mock.received.cancels.length >= 1);
    expect(mock.received.cancels[0]?.targetId).toBe(slowReq?.id);

    // The mock ignores the cancel and eventually sends the real res; the
    // tombstone swallows it without delivering or crashing.
    await waitFor(() => client!.stats.lateDrops >= 1, 3000);
    expect(client.stats.lateDrops).toBe(1);

    // The connection is still healthy for new calls afterwards.
    const after = (await client.call("sys.echo", { after: true })) as Record<string, unknown>;
    expect(after).toEqual({ after: true });
  });

  it("delivers progress frames only to the owning call", async () => {
    mock = new MockPlugin({
      registryDir: tmp,
      handlers: {
        "test.progress": async (params: unknown, ctx: MockHandlerContext) => {
          for (let pct = 0; pct <= 100; pct += 50) {
            ctx.progress({ pct, message: `at ${pct}` });
            await ctx.delay(10);
          }
          return { done: true };
        },
      },
    });
    await mock.start();
    client = new UnityClient({ config: cfg });

    const seenA: number[] = [];
    const seenB: number[] = [];
    const [a, b] = await Promise.all([
      client.call("test.progress", {}, { onProgress: (p) => seenA.push(p.pct ?? -1) }),
      client.call("sys.echo", { b: 1 }, { onProgress: (p) => seenB.push(p.pct ?? -1) }),
    ]);
    expect(a).toEqual({ done: true });
    expect(b).toEqual({ b: 1 });
    expect(seenA).toEqual([0, 50, 100]);
    expect(seenB).toEqual([]);
  });
});
