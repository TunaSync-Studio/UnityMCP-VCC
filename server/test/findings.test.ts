// Regression coverage for the 2026-08-06 live-test findings (F-2 server side,
// F-5). Self-contained harness (same shape as confirm.test.ts).
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
import { MockPlugin, type MockPluginOptions } from "./mock-plugin.js";

interface Harness {
  mock: MockPlugin;
  callTool: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;
  cleanup: () => Promise<void>;
}

async function setup(mockOpts?: Partial<MockPluginOptions>): Promise<Harness> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-findings-"));
  const mock = new MockPlugin({ registryDir: tmp, ...mockOpts });
  await mock.start();
  const cfg: Config = { projectSelector: undefined, registryDir: tmp, defaultTimeoutMs: 5000 };
  const pool = new ProjectPool(cfg);
  const recipes = new RecipeLibrary(path.join(tmp, "no-recipes-here"));
  const server = createMcpServer({ pool, cfg, recipes });
  const mcp = new Client({ name: "findings-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)]);
  return {
    mock,
    callTool: async (name, args) =>
      (await mcp.callTool({ name, arguments: args }, undefined, {})) as CallToolResult,
    cleanup: async () => {
      await mcp.close().catch(() => undefined);
      await server.close().catch(() => undefined);
      pool.disposeAll();
      await mock.stop();
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}

function jsonOf(res: CallToolResult, i = 0): Record<string, unknown> {
  const c = res.content[i];
  if (!c || c.type !== "text") throw new Error("expected text content");
  return JSON.parse(c.text) as Record<string, unknown>;
}

// REAL plugin shape: job.status(all) = BARE ARRAY (JobManager.AllRecords()).
// F-10 was exactly a mock-only {jobs:[...]} wrapper assumption - keep the
// primary fixtures in the real shape and cover the wrapper as a tolerance.
const FAT_JOBS_ARRAY = [
  {
    jobId: "job-1",
    method: "eval.run",
    state: "completed",
    phase: "done",
    pct: 100,
    result: { value: "x".repeat(500) },
    logs: Array.from({ length: 50 }, (_, i) => ({ id: i, message: `log ${i}` })),
  },
  {
    jobId: "job-2",
    method: "ndmf.bake",
    state: "failed",
    error: { code: "HANDLER_EXCEPTION", message: "boom", retryable: false, detail: { big: "yes" } },
    logs: [{ id: 1, message: "noisy" }],
  },
];

describe("F-5/F-10: job_status all-jobs summarization", () => {
  let h: Harness | null = null;

  afterEach(async () => {
    if (h) await h.cleanup();
    h = null;
  });

  it("summarizes the REAL bare-array plugin shape (F-10 regression)", async () => {
    h = await setup({ handlers: { "job.status": () => FAT_JOBS_ARRAY } });
    const res = await h.callTool("job_status", {});
    const body = jsonOf(res);
    expect(body.summarized).toBe(true);
    const jobs = body.jobs as Array<Record<string, unknown>>;
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ jobId: "job-1", method: "eval.run", state: "completed", pct: 100 });
    expect(jobs[0]?.result).toBeUndefined();
    expect(jobs[0]?.logs).toBeUndefined();
    // Errors survive as {code, message} only.
    expect(jobs[1]?.error).toEqual({ code: "HANDLER_EXCEPTION", message: "boom" });
    expect((jobs[1]?.error as Record<string, unknown>).detail).toBeUndefined();
  });

  it("also tolerates a {jobs:[...]} wrapper shape", async () => {
    h = await setup({ handlers: { "job.status": () => ({ jobs: FAT_JOBS_ARRAY, extra: "kept" }) } });
    const res = await h.callTool("job_status", {});
    const body = jsonOf(res);
    expect(body.summarized).toBe(true);
    expect(body.extra).toBe("kept");
    const jobs = body.jobs as Array<Record<string, unknown>>;
    expect(jobs[0]?.logs).toBeUndefined();
  });

  it("include_details:true returns the raw full records (bare array passthrough)", async () => {
    h = await setup({ handlers: { "job.status": () => FAT_JOBS_ARRAY } });
    const res = await h.callTool("job_status", { include_details: true });
    const c = res.content[0];
    if (!c || c.type !== "text") throw new Error("expected text content");
    const body = JSON.parse(c.text) as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]?.result).toBeDefined();
    expect(body[0]?.logs).toHaveLength(50);
  });

  it("job_id lookups are never summarized", async () => {
    h = await setup({
      handlers: {
        "job.status": (params) => {
          const p = params as { jobId?: string };
          expect(p.jobId).toBe("job-1");
          return { jobId: "job-1", method: "eval.run", state: "completed", logs: [{ id: 1 }] };
        },
      },
    });
    const res = await h.callTool("job_status", { job_id: "job-1" });
    const body = jsonOf(res);
    expect(body.logs).toHaveLength(1);
  });
});

describe("F-12: unresponsive editor must not read as 'not found'", () => {
  let h: Harness | null = null;

  afterEach(async () => {
    if (h) await h.cleanup();
    h = null;
  });

  function ageRegistryFile(mock: MockPlugin, tmpDirOfHarness: string): void {
    // Make the heartbeat look >150 s old while the pid stays alive: exactly
    // the blocked-main-thread situation from the live retest.
    const file = mock.writeRegistry();
    const past = new Date(Date.now() - 200_000);
    fs.utimesSync(file, past, past);
    void tmpDirOfHarness;
  }

  it("scene_query answers BUSY_MODAL (retryable, with identity), not PROJECT_NOT_FOUND", async () => {
    h = await setup();
    ageRegistryFile(h.mock, "");
    const res = await h.callTool("scene_query", { query: "Anything" });
    expect(res.isError).toBe(true);
    const c = res.content[0];
    if (!c || c.type !== "text") throw new Error("expected text");
    expect(c.text).toContain("BUSY_MODAL");
    expect(c.text).toContain("unresponsive");
    const detailBlock = res.content[1];
    if (!detailBlock || detailBlock.type !== "text") throw new Error("expected detail json");
    const parsed = JSON.parse(detailBlock.text) as {
      error: {
        retryable: boolean;
        detail: { candidates: Array<Record<string, unknown>>; heartbeatAgeMs: number };
      };
    };
    expect(parsed.error.retryable).toBe(true);
    expect(parsed.error.detail.heartbeatAgeMs).toBeGreaterThan(150_000);
    expect(parsed.error.detail.candidates[0]).toMatchObject({
      projectName: h.mock.projectName,
      reason: "unresponsive",
    });
    expect(typeof parsed.error.detail.candidates[0]?.pid).toBe("number");
    // F-13 completion: error responses carry the server identity too.
    const withServer = JSON.parse(detailBlock.text) as { server?: { version?: string } };
    const { SERVER_VERSION } = await import("../src/version.js");
    expect(withServer.server?.version).toBe(SERVER_VERSION);
  });

  it("unity_health_check reports status:unresponsive when a blocked editor exists", async () => {
    h = await setup();
    ageRegistryFile(h.mock, "");
    const res = await h.callTool("unity_health_check", {});
    const c = res.content[0];
    if (!c || c.type !== "text") throw new Error("expected text");
    const body = JSON.parse(c.text) as Record<string, unknown>;
    // Zero alive entries but one blocked editor -> vocabulary matches the
    // resolve path instead of claiming "no_unity".
    expect(body.status).toBe("unresponsive");
    expect(String(body.detail)).toContain("stalled heartbeat");
    // F-13: every health answer identifies the server build/process.
    const { SERVER_VERSION } = await import("../src/version.js");
    const server = body.server as Record<string, unknown>;
    expect(server.version).toBe(SERVER_VERSION);
    expect(server.build).toBe("dev"); // vitest runs from src, not the bundle
    expect(typeof server.pid).toBe("number");
    expect(typeof server.startedAt).toBe("string");
  });

  it("unity_health_check still says no_unity when the registry is truly empty-ish", async () => {
    h = await setup();
    h.mock.writeRegistry({ pid: 999999 }); // dead pid, no unresponsive entries
    await h.mock.stop();
    h.mock.writeRegistry({ pid: 999999 });
    const res = await h.callTool("unity_health_check", {});
    const c = res.content[0];
    if (!c || c.type !== "text") throw new Error("expected text");
    const body = JSON.parse(c.text) as Record<string, unknown>;
    expect(body.status).toBe("no_unity");
  });

  it("a genuinely absent editor still reads PROJECT_NOT_FOUND, with candidates", async () => {
    h = await setup();
    // Dead pid (not unresponsive): registry entry whose pid can't exist.
    h.mock.writeRegistry({ pid: 999999 });
    await h.mock.stop(); // listener gone, keep only the dead-pid entry
    h.mock.writeRegistry({ pid: 999999 });
    const res = await h.callTool("scene_query", { query: "Anything" });
    expect(res.isError).toBe(true);
    const c = res.content[0];
    if (!c || c.type !== "text") throw new Error("expected text");
    expect(c.text).toContain("PROJECT_NOT_FOUND");
    const detailBlock = res.content[1];
    if (!detailBlock || detailBlock.type !== "text") throw new Error("expected detail json");
    const parsed = JSON.parse(detailBlock.text) as {
      error: { detail: { candidates: Array<Record<string, unknown>> } };
    };
    expect(parsed.error.detail.candidates[0]).toMatchObject({ reason: "pid_dead" });
  });
});

describe("F-7: log id spaces", () => {
  it("ring entries carry pluginId (eval-log id space) and honor firstStackLine", async () => {
    const { LogRing } = await import("../src/unity/logs.js");
    const ring = new LogRing();
    // Real plugin event shape: LogCapture.Entry camelCased.
    const e1 = ring.push({
      level: "info",
      message: "hello",
      firstStackLine: "at EditorCommand.Execute ()",
      id: 568,
      ts: "2026-08-06T00:00:00Z",
    });
    expect(e1.id).toBe(1); // server-ring id space
    expect(e1.pluginId).toBe(568); // eval-response id space
    expect(e1.stack).toBe("at EditorCommand.Execute ()");

    // Tolerates a plain "stack" field and a missing plugin id.
    const e2 = ring.push({ level: "error", message: "boom", stack: "raw stack" });
    expect(e2.pluginId).toBeUndefined();
    expect(e2.stack).toBe("raw stack");

    // stack participates in regex queries again.
    expect(ring.query({ regex: "EditorCommand" })).toHaveLength(1);
  });
});

describe("F-2 (server side): session_lease contract", () => {
  let h: Harness | null = null;

  afterEach(async () => {
    if (h) await h.cleanup();
    h = null;
  });

  it("always sends its own session id as clientId and converts ttl_s to ttlMs", async () => {
    h = await setup();
    await h.callTool("session_lease", { action: "acquire", ttl_s: 30 });
    const req = h.mock.received.reqs.find((r) => r.method === "lease.acquire");
    expect(req).toBeDefined();
    const params = req?.params as Record<string, unknown>;
    expect(params.ttlMs).toBe(30_000);
    // clientId is the server session's own id - a client cannot inject one.
    expect(typeof params.clientId).toBe("string");
    expect((params.clientId as string).length).toBeGreaterThan(0);
    const hello = h.mock.received.hellos[0];
    expect(params.clientId).toBe(hello?.client.sessionId);
  });
});
