// CallOptions.requireWelcome: a request is only written over a connection
// whose welcome satisfies the predicate - evaluated at send time, also for a
// request that waited in the hold queue across a reconnect. vrc_upload uses it
// so a real upload is never submitted to a plugin build that does not claim
// the human arm itself, even if the plugin was swapped after the check.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { UnityMcpError } from "../src/errors.js";
import type { WelcomePayload } from "../src/protocol.js";
import { UnityClient } from "../src/unity/client.js";
import { MockPlugin, type MockPluginOptions } from "./mock-plugin.js";

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

const hasFeature = (w: WelcomePayload): boolean => w.features.includes("needed");

function received(mock: MockPlugin, method: string): number {
  return mock.received.reqs.filter((r) => r.method === method).length;
}

describe("CallOptions.requireWelcome", () => {
  let tmp: string;
  let cfg: Config;
  let opts: MockPluginOptions;
  let mock: MockPlugin;
  let client: UnityClient | null = null;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-reqwelcome-"));
    cfg = { projectSelector: undefined, registryDir: tmp, defaultTimeoutMs: 5000 };
  });

  afterEach(async () => {
    client?.dispose();
    client = null;
    await mock.stop();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  async function start(features: string[]): Promise<UnityClient> {
    opts = { registryDir: tmp, features };
    mock = new MockPlugin(opts);
    await mock.start();
    client = new UnityClient({ config: cfg, backoffMs: [50, 100, 200], heartbeatMs: 0 });
    await client.call("sys.echo", { warm: 1 });
    expect(client.getState()).toBe("ready");
    return client;
  }

  it("sends when the live welcome satisfies the predicate", async () => {
    const c = await start(["needed"]);
    await c.call("sys.echo", { x: 1 }, { requireWelcome: hasFeature });
    expect(received(mock, "sys.echo")).toBe(2);
  });

  it("rejects without sending when it does not (ready connection)", async () => {
    const c = await start([]);
    const err = await c
      .call("sys.echo", { x: 1 }, { requireWelcome: hasFeature })
      .then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(UnityMcpError);
    const obj = (err as UnityMcpError).obj;
    expect(obj.code).toBe("VERSION_UNSUPPORTED");
    expect(obj.retryable).toBe(false);
    expect((obj.detail as { precondition: string }).precondition).toBe("requireWelcome");
    expect(received(mock, "sys.echo")).toBe(1); // only the warm-up
  });

  it("re-checks a held request against the connection it is finally sent on", async () => {
    const c = await start(["needed"]);
    // Plugin build swapped during a reload: the new connection lacks the feature.
    await mock.simulateReload({ resumeMs: 300, resumeHintMs: 100 });
    await waitFor(() => c.getState() !== "ready");
    opts.features = [];
    const err = await c
      .call("sys.echo", { held: 1 }, { requireWelcome: hasFeature, timeoutMs: 5000 })
      .then(() => null, (e: unknown) => e);
    expect(c.getState()).toBe("ready");
    expect((err as UnityMcpError).obj.code).toBe("VERSION_UNSUPPORTED");
    expect(received(mock, "sys.echo")).toBe(1); // the held request never went out
  });

  it("a held request goes out after a reconnect that keeps the feature", async () => {
    const c = await start(["needed"]);
    await mock.simulateReload({ resumeMs: 300, resumeHintMs: 100 });
    await waitFor(() => c.getState() !== "ready");
    await c.call("sys.echo", { held: 1 }, { requireWelcome: hasFeature, timeoutMs: 5000 });
    expect(received(mock, "sys.echo")).toBe(2);
  });
});
