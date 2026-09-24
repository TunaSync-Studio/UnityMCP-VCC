// get_logs plugin fallback: the plugin's logs.get matches `level` EXACTLY and
// answers in its own id space, so the server must not forward the tool's
// "minimum severity" / since_id semantics verbatim. Also: an emptied ring
// (editor session change) must fall back again, not answer [] forever.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "../src/config.js";
import { createMcpServer } from "../src/mcp/server.js";
import { RecipeLibrary } from "../src/recipes.js";
import { ProjectPool } from "../src/unity/pool.js";
import { MockPlugin } from "./mock-plugin.js";

// Mirror of StateHandlers.LogsGet: exact (case-insensitive) level match,
// plugin ids, camelCase LogCapture.Entry fields.
const PLUGIN_BUFFER = [
  { id: 3001, ts: "t1", level: "info", message: "boot" },
  { id: 3002, ts: "t2", level: "warning", message: "careful" },
  { id: 3003, ts: "t3", level: "error", message: "broken", firstStackLine: "at Foo.cs:1" },
  { id: 3004, ts: "t4", level: "exception", message: "NullReferenceException: boom" },
  { id: 3005, ts: "t5", level: "assert", message: "assert failed" },
];

function pluginLogsGet(params: unknown): unknown {
  const p = (params ?? {}) as { level?: string; sinceId?: number; count?: number };
  const all = PLUGIN_BUFFER.filter(
    (e) =>
      e.id > (p.sinceId ?? 0) &&
      (p.level === undefined || e.level.toLowerCase() === p.level.toLowerCase()),
  );
  const count = p.count ?? 100;
  return { total: all.length, lastId: 3005, entries: all.slice(-count) };
}

interface Harness {
  mock: MockPlugin;
  pool: ProjectPool;
  get: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  cleanup: () => Promise<void>;
}

async function setup(): Promise<Harness> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-logs-"));
  const mock = new MockPlugin({ registryDir: tmp, handlers: { "logs.get": pluginLogsGet } });
  await mock.start();
  const cfg: Config = { projectSelector: undefined, registryDir: tmp, defaultTimeoutMs: 5000 };
  const pool = new ProjectPool(cfg);
  const server = createMcpServer({ pool, cfg, recipes: new RecipeLibrary(path.join(tmp, "none")) });
  const mcp = new Client({ name: "logs-test", version: "0.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), mcp.connect(ct)]);
  return {
    mock,
    pool,
    get: async (args) => {
      const res = (await mcp.callTool({ name: "get_logs", arguments: args })) as CallToolResult;
      const c = res.content[0];
      if (!c || c.type !== "text") throw new Error("expected text");
      return JSON.parse(c.text) as Record<string, unknown>;
    },
    cleanup: async () => {
      await mcp.close().catch(() => undefined);
      await server.close().catch(() => undefined);
      pool.disposeAll();
      await mock.stop();
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}

function levels(body: Record<string, unknown>): string[] {
  return (body.entries as Array<{ level: string }>).map((e) => e.level);
}

describe("get_logs plugin fallback", () => {
  let h: Harness | null = null;
  afterEach(async () => {
    if (h) await h.cleanup();
    h = null;
  });

  it("applies minimum severity locally (error includes exception/assert)", async () => {
    h = await setup();
    const errors = await h.get({ level: "error" });
    expect(errors.source).toBe("plugin");
    expect(levels(errors)).toEqual(["error", "exception", "assert"]);
    expect(levels(await h.get({ level: "warning" }))).toEqual([
      "warning",
      "error",
      "exception",
      "assert",
    ]);
    expect(levels(await h.get({ level: "debug" }))).toHaveLength(5);
    // The plugin must have been asked for its buffer, never for an exact level.
    const wire = h.mock.received.reqs.filter((r) => r.method === "logs.get");
    expect(wire.every((r) => (r.params as Record<string, unknown>).level === undefined)).toBe(true);
  });

  it("answers in the ring id space: lastId is a ring id, entries carry pluginId", async () => {
    h = await setup();
    const body = await h.get({ since_id: 3002 });
    expect(body.lastId).toBe(0);
    const entries = body.entries as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(5); // plugin ids are not ring ids: since_id does not filter them
    expect(entries[2]).toMatchObject({ pluginId: 3003, level: "error", stack: "at Foo.cs:1" });
    expect(entries[2]?.id).toBeUndefined();
  });

  it("falls back again once the ring was emptied (editor session change)", async () => {
    h = await setup();
    const { logs } = h.pool.resolve();
    await h.get({}); // connect
    h.mock.sendEvent("log", { id: 1, level: "info", message: "live" });
    await new Promise((r) => setTimeout(r, 50));
    const ring = await h.get({});
    expect(ring.source).toBe("ring");
    logs.clear(); // what pool's onSessionChanged does
    const after = await h.get({ level: "error" });
    expect(after.source).toBe("plugin");
    expect(levels(after)).toEqual(["error", "exception", "assert"]);
  });
});
