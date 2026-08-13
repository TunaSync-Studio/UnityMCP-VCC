// Connection handshake: version negotiation accept/reject and hello timeout.

import { afterEach, describe, expect, it } from "vitest";
import { Connection, type ConnectionEvents } from "../src/transport/connection.js";
import { UnityMcpError } from "../src/errors.js";
import type { HelloPayload } from "../src/protocol.js";
import { MockPlugin } from "./mock-plugin.js";

function hello(): HelloPayload {
  return {
    v: { min: 1, max: 1 },
    client: { name: "test-client", version: "0.0.0", pid: process.pid, sessionId: "test-session" },
    features: [],
  };
}

function silentEvents(): ConnectionEvents {
  return {
    onRes: () => undefined,
    onProgress: () => undefined,
    onEvent: () => undefined,
    onBye: () => undefined,
    onClose: () => undefined,
    onError: () => undefined,
  };
}

describe("handshake", () => {
  let mock: MockPlugin | null = null;
  let conn: Connection | null = null;

  afterEach(async () => {
    conn?.destroy();
    conn = null;
    if (mock) await mock.stop();
    mock = null;
  });

  it("accepts a matching version and resolves with the welcome payload", async () => {
    mock = new MockPlugin({ projectName: "HandshakeOk" });
    const port = await mock.start();
    conn = new Connection({ host: "127.0.0.1", port, hello: hello(), events: silentEvents() });
    const welcome = await conn.connect();
    expect(welcome.v).toBe(1);
    expect(welcome.unity.projectName).toBe("HandshakeOk");
    expect(conn.state).toBe("ready");
    expect(mock.received.hellos).toHaveLength(1);
    expect(mock.received.hellos[0]?.client.name).toBe("test-client");
  });

  it("rejects with VERSION_UNSUPPORTED when the plugin requires a newer protocol", async () => {
    mock = new MockPlugin({ versionMin: 2, versionMax: 3 });
    const port = await mock.start();
    conn = new Connection({ host: "127.0.0.1", port, hello: hello(), events: silentEvents() });
    const err = await conn.connect().then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(UnityMcpError);
    expect((err as UnityMcpError).code).toBe("VERSION_UNSUPPORTED");
  });

  it("negotiates down to the client max against a higher-versioned plugin", async () => {
    // Audit note: this test was once named "rejects ... v99" while asserting
    // SUCCESS - the mock negotiates correctly (min(ourMax=1, plugin=99) = 1),
    // so the contract under test is downward negotiation, not rejection.
    mock = new MockPlugin({ versionMin: 1, versionMax: 99 });
    const port = await mock.start();
    conn = new Connection({ host: "127.0.0.1", port, hello: hello(), events: silentEvents() });
    const welcome = await conn.connect();
    expect(welcome.v).toBe(1);
  });

  it("rejects with HELLO_TIMEOUT when no welcome arrives in time", async () => {
    mock = new MockPlugin({ autoWelcome: false });
    const port = await mock.start();
    conn = new Connection({
      host: "127.0.0.1",
      port,
      hello: hello(),
      events: silentEvents(),
      helloTimeoutMs: 200,
    });
    const started = Date.now();
    const err = await conn.connect().then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(UnityMcpError);
    expect((err as UnityMcpError).code).toBe("HELLO_TIMEOUT");
    expect(Date.now() - started).toBeLessThan(5000);
    expect(conn.state).toBe("closed");
  });

  it("rejects when the port has no listener at all", async () => {
    // Grab a port that is free by binding and immediately closing a mock.
    mock = new MockPlugin({});
    const port = await mock.start();
    await mock.stop();
    mock = null;
    conn = new Connection({ host: "127.0.0.1", port, hello: hello(), events: silentEvents() });
    const err = await conn.connect().then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeTruthy();
    expect(conn.state).toBe("closed");
  });
});
