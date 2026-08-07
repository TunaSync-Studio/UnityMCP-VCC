// Reconnect state machine: bye(domain_reload) -> degraded hold queue -> mock
// rebinds -> held call completes. Plus the ghost-socket regression guard and
// grace exhaustion.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { UnityMcpError } from "../src/errors.js";
import { Connection, type ConnectionEvents } from "../src/transport/connection.js";
import { UnityClient } from "../src/unity/client.js";
import type { Envelope, HelloPayload, ResPayload } from "../src/protocol.js";
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

describe("reconnect", () => {
  let tmp: string;
  let cfg: Config;
  let mock: MockPlugin;
  let client: UnityClient | null = null;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-reconn-"));
    cfg = { projectSelector: undefined, registryDir: tmp, defaultTimeoutMs: 5000 };
  });

  afterEach(async () => {
    client?.dispose();
    client = null;
    await mock.stop();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("holds a call through a domain reload and completes it after rebind", async () => {
    mock = new MockPlugin({ registryDir: tmp });
    await mock.start();
    client = new UnityClient({
      config: cfg,
      backoffMs: [50, 100, 200],
      heartbeatMs: 0,
    });

    await client.call("sys.echo", { warm: 1 });
    expect(client.getState()).toBe("ready");
    expect(mock.connectionCount).toBe(1);

    await mock.simulateReload({ resumeMs: 300, resumeHintMs: 100 });
    await waitFor(() => client!.getState() !== "ready");

    // Issued while degraded/reconnecting: must wait in the hold queue.
    const held = client.call("sys.echo", { heldCall: true }, { timeoutMs: 10_000 });
    const state = client.getState();
    expect(["degraded", "reconnecting", "connecting", "handshaking"]).toContain(state);

    const result = (await held) as Record<string, unknown>;
    expect(result).toEqual({ heldCall: true });
    expect(client.getState()).toBe("ready");
    expect(mock.connectionCount).toBe(2);
  });

  it("ghost regression (Connection level): destroying conn A leaves conn B fully working", async () => {
    mock = new MockPlugin({ registryDir: tmp });
    const port = await mock.start();

    const hello: HelloPayload = {
      v: { min: 1, max: 1 },
      client: { name: "ghost-test", version: "0", pid: process.pid, sessionId: "ghost" },
      features: [],
    };
    const silent: ConnectionEvents = {
      onRes: () => undefined,
      onProgress: () => undefined,
      onEvent: () => undefined,
      onBye: () => undefined,
      onClose: () => undefined,
      onError: () => undefined,
    };

    const connA = new Connection({ host: "127.0.0.1", port, hello, events: silent });
    await connA.connect();

    let bRes: ResPayload | null = null;
    let bClosed = false;
    const connB = new Connection({
      host: "127.0.0.1",
      port,
      hello,
      events: {
        ...silent,
        onRes: (_id, payload) => {
          bRes = payload;
        },
        onClose: () => {
          bClosed = true;
        },
      },
    });
    await connB.connect();
    connB.release();

    // Kill A while B is live. B must be completely unaffected.
    connA.destroy();
    await sleep(50);
    expect(connB.state).toBe("ready");
    expect(bClosed).toBe(false);

    const req: Envelope = {
      id: "ghost-req-1",
      type: "req",
      payload: { method: "sys.echo", params: { via: "B" } },
    };
    expect(connB.send(req)).toBe(true);
    await waitFor(() => bRes !== null);
    expect(bRes).toEqual({ ok: true, result: { via: "B" } });
    connB.destroy();
  });

  it("ghost regression (client level): a stale connection object cannot clobber the live one", async () => {
    mock = new MockPlugin({ registryDir: tmp });
    await mock.start();
    client = new UnityClient({ config: cfg, backoffMs: [50, 100, 200], heartbeatMs: 0 });

    await client.call("sys.echo", { warm: 1 });
    const connA = client.currentConnectionForTest;
    expect(connA).not.toBeNull();

    await mock.simulateReload({ resumeMs: 150 });
    await waitFor(() => client!.getState() !== "ready");
    await waitFor(() => client!.getState() === "ready", 8000);

    const connB = client.currentConnectionForTest;
    expect(connB).not.toBeNull();
    expect(connB).not.toBe(connA);

    // Stale-destroy the old connection object again (double close). The
    // identity guard must keep the client ready on conn B.
    connA?.destroy();
    await sleep(100);
    expect(client.getState()).toBe("ready");
    const out = (await client.call("sys.echo", { alive: true })) as Record<string, unknown>;
    expect(out).toEqual({ alive: true });
  });

  it("rejects held calls with RECONNECT_TIMEOUT when the grace window exhausts", async () => {
    mock = new MockPlugin({ registryDir: tmp });
    await mock.start();
    client = new UnityClient({
      config: cfg,
      backoffMs: [50, 100],
      graceReloadMs: 500,
      heartbeatMs: 0,
    });

    await client.call("sys.echo", { warm: 1 });

    // Reload that never comes back: stop the mock entirely after the bye.
    // Keep the registry file so the client keeps treating the project as
    // present (pid alive) and stays in the reconnect grace path.
    await mock.simulateReload({ resumeMs: 60_000 });
    await waitFor(() => client!.getState() !== "ready");

    const err = await client.call("sys.echo", { held: true }, { timeoutMs: 10_000 }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(UnityMcpError);
    expect((err as UnityMcpError).code).toBe("RECONNECT_TIMEOUT");
    expect(client.getState()).toBe("failed");
  });

  it("fails fast with UNITY_UNREACHABLE while failed, before any grace", async () => {
    mock = new MockPlugin({ registryDir: tmp });
    await mock.start();
    // Point the client at a selector that exists, then stop the listener but
    // keep a registry file with a live pid and a dead port.
    client = new UnityClient({ config: cfg, backoffMs: [50], heartbeatMs: 0 });
    await client.call("sys.echo", { warm: 1 });
    const deadPort = mock.port;
    await mock.stop();
    mock = new MockPlugin({ registryDir: tmp }); // placeholder so afterEach stop() works
    // Rewrite a registry entry pointing at the now-closed port.
    fs.mkdirSync(tmp, { recursive: true });
    fs.writeFileSync(
      path.join(tmp, "deadbeef.json"),
      JSON.stringify({
        schemaVersion: 1,
        port: deadPort,
        projectPath: "C:/Test/MockProject",
        projectName: "MockProject",
        pid: process.pid,
        unityVersion: "x",
        pluginVersion: "x",
        protocolV: 1,
        startedAt: new Date().toISOString(),
      }),
      "utf8",
    );

    // The close was unexpected (no bye): 30 s grace would normally apply, but
    // with the tiny backoff the attempts run and fail quickly; instead just
    // verify that a call in failed state fails fast without hanging.
    client.dispose();
    client = new UnityClient({
      config: cfg,
      backoffMs: [50],
      graceCloseMs: 200,
      heartbeatMs: 0,
    });
    const started = Date.now();
    const err = await client.call("sys.echo", {}, { timeoutMs: 30_000 }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(UnityMcpError);
    expect((err as UnityMcpError).code).toBe("UNITY_UNREACHABLE");
    expect(Date.now() - started).toBeLessThan(5000);
    expect(client.getState()).toBe("failed");
  });
});
