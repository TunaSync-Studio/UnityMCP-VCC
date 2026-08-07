// v2.1 token auth: the client echoes the registry token in hello; a wrong or
// missing token gets AUTH_REQUIRED, which is terminal (no reconnect loop).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { UnityMcpError } from "../src/errors.js";
import { UnityClient } from "../src/unity/client.js";
import { MockPlugin } from "./mock-plugin.js";

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

describe("registry token auth", () => {
  let tmp: string;
  let cfg: Config;
  let mock: MockPlugin;
  let client: UnityClient | null = null;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-token-"));
    cfg = { projectSelector: undefined, registryDir: tmp, defaultTimeoutMs: 5000 };
  });

  afterEach(async () => {
    client?.dispose();
    client = null;
    await mock.stop();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("echoes the registry token in hello and connects with the correct token", async () => {
    mock = new MockPlugin({ registryDir: tmp, requireToken: "s3cret-token" });
    await mock.start();
    client = new UnityClient({ config: cfg, heartbeatMs: 0 });

    const out = (await client.call("sys.echo", { with: "token" })) as Record<string, unknown>;
    expect(out).toEqual({ with: "token" });
    expect(client.getState()).toBe("ready");
    expect(mock.received.hellos).toHaveLength(1);
    expect(mock.received.hellos[0]?.client.token).toBe("s3cret-token");
  });

  it("omits the token field entirely when the registry has none", async () => {
    mock = new MockPlugin({ registryDir: tmp });
    await mock.start();
    client = new UnityClient({ config: cfg, heartbeatMs: 0 });
    await client.call("sys.echo", {});
    expect(mock.received.hellos[0]?.client).not.toHaveProperty("token");
  });

  it("wrong token -> AUTH_REQUIRED surfaced with a clear message, no reconnect loop", async () => {
    mock = new MockPlugin({
      registryDir: tmp,
      requireToken: "right-token",
      advertiseToken: "wrong-token", // stale registry from another user/session
    });
    await mock.start();
    client = new UnityClient({
      config: cfg,
      heartbeatMs: 0,
      backoffMs: [25, 50],
      rediscoverMs: 60_000, // keep background rediscover out of the test window
    });

    const err = await client.call("sys.echo", {}, { timeoutMs: 5000 }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(UnityMcpError);
    const u = err as UnityMcpError;
    expect(u.code).toBe("AUTH_REQUIRED");
    expect(u.message).toContain("token mismatch");
    expect(u.message).toContain("different user");
    expect(client.getState()).toBe("failed");

    // Terminal: no automatic retry storm. Exactly one connection attempt.
    const connsAfterFailure = mock.connectionCount;
    expect(connsAfterFailure).toBe(1);
    await sleep(300);
    expect(mock.connectionCount).toBe(connsAfterFailure);
    expect(client.getState()).toBe("failed");
  });

  it("missing token when the plugin requires one -> AUTH_REQUIRED", async () => {
    mock = new MockPlugin({
      registryDir: tmp,
      requireToken: "needed-token",
      advertiseToken: null, // registry entry carries no token at all
    });
    await mock.start();
    client = new UnityClient({ config: cfg, heartbeatMs: 0, rediscoverMs: 60_000 });

    const err = await client.call("sys.echo", {}, { timeoutMs: 5000 }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(UnityMcpError);
    expect((err as UnityMcpError).code).toBe("AUTH_REQUIRED");
    expect(client.getState()).toBe("failed");
  });

  it("AUTH_REQUIRED during a reload reconnect is terminal too (no grace retry loop)", async () => {
    // Connect fine without a token, then simulate the plugin starting to
    // require one after its reload. advertiseToken:null keeps the registry
    // token-less across the rebind, so the reconnect hello cannot satisfy it.
    mock = new MockPlugin({ registryDir: tmp, advertiseToken: null });
    await mock.start();
    client = new UnityClient({
      config: cfg,
      heartbeatMs: 0,
      backoffMs: [25, 50],
      graceReloadMs: 5_000,
      rediscoverMs: 60_000,
    });
    await client.call("sys.echo", { warm: 1 });

    mock.setRequireToken("rotated");
    await mock.simulateReload({ resumeMs: 50 });
    await waitFor(() => client!.getState() !== "ready");

    const err = await client.call("sys.echo", {}, { timeoutMs: 4000 }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(UnityMcpError);
    expect((err as UnityMcpError).code).toBe("AUTH_REQUIRED");
    expect(client.getState()).toBe("failed");
  });
});
