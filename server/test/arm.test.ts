// Human arm gate: a real vrc_upload needs confirm:true AND a fresh one-shot
// arm file. Self-contained harness (same shape as confirm.test.ts).
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
import { checkArm, DEFAULT_ARM_TTL_MS } from "../src/armGate.js";
import { SERVER_VERSION } from "../src/version.js";
import { MockPlugin } from "./mock-plugin.js";

interface Harness {
  mock: MockPlugin;
  armFile: string;
  callTool: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;
  cleanup: () => Promise<void>;
}

async function setup(): Promise<Harness> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-arm-"));
  const mock = new MockPlugin({ registryDir: tmp });
  await mock.start();
  const armFile = path.join(tmp, "vrc-upload.arm");
  const cfg: Config = {
    projectSelector: undefined,
    registryDir: tmp,
    defaultTimeoutMs: 5000,
    armFile,
  };
  const pool = new ProjectPool(cfg);
  const recipes = new RecipeLibrary(path.join(tmp, "no-recipes-here"));
  const server = createMcpServer({ pool, cfg, recipes });
  const mcp = new Client({ name: "arm-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)]);
  return {
    mock,
    armFile,
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

function textOf(res: CallToolResult, i = 0): string {
  const c = res.content[i];
  if (!c || c.type !== "text") throw new Error("expected text content");
  return c.text;
}

describe("vrc_upload human arm gate", () => {
  let h: Harness | null = null;

  afterEach(async () => {
    if (h) await h.cleanup();
    h = null;
  });

  it("refuses a confirmed real upload without the arm file and submits nothing", async () => {
    h = await setup();
    const res = await h.callTool("vrc_upload", {
      target: "avatar",
      dry_run: false,
      confirm: true,
    });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("ARM_REQUIRED");
    expect(h.mock.received.reqs.some((r) => r.method === "job.submit")).toBe(false);
  });

  it("confirm gate still fires first, even when armed", async () => {
    h = await setup();
    fs.writeFileSync(h.armFile, "armed by test");
    const res = await h.callTool("vrc_upload", { target: "avatar", dry_run: false });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("CONFIRM_REQUIRED");
    // Arm file must NOT be consumed by a refused call.
    expect(fs.existsSync(h.armFile)).toBe(true);
  });

  it("armed + confirmed real upload submits and consumes the arm file (one-shot)", async () => {
    h = await setup();
    fs.writeFileSync(h.armFile, "armed by test");
    await h.callTool("vrc_upload", {
      target: "avatar",
      dry_run: false,
      confirm: true,
      timeout_ms: 2_000,
    });
    const submit = h.mock.received.reqs.find((r) => r.method === "job.submit");
    expect(submit).toBeDefined();
    const params = (submit?.params as { params: Record<string, unknown> }).params;
    expect(params.confirm).toBe(true);
    expect(params.dryRun).toBe(false);
    expect(fs.existsSync(h.armFile)).toBe(false);

    // Second attempt without re-arming must be refused again.
    const again = await h.callTool("vrc_upload", {
      target: "avatar",
      dry_run: false,
      confirm: true,
    });
    expect(again.isError).toBe(true);
    expect(textOf(again)).toContain("ARM_REQUIRED");
  });

  it("an expired arm file does not arm", async () => {
    h = await setup();
    fs.writeFileSync(h.armFile, "old");
    const past = new Date(Date.now() - DEFAULT_ARM_TTL_MS - 60_000);
    fs.utimesSync(h.armFile, past, past);
    const res = await h.callTool("vrc_upload", {
      target: "avatar",
      dry_run: false,
      confirm: true,
    });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("ARM_REQUIRED");
    expect(textOf(res)).toContain("expired");
    expect(h.mock.received.reqs.some((r) => r.method === "job.submit")).toBe(false);
  });

  it("dry_run needs neither confirm nor arm", async () => {
    h = await setup();
    await h.callTool("vrc_upload", { target: "avatar", dry_run: true, timeout_ms: 2_000 });
    const submit = h.mock.received.reqs.find((r) => r.method === "job.submit");
    expect(submit).toBeDefined();
  });

  // F-17: the hand-built early-return errors carry the same server identity
  // block as fail() responses (sibling of error, never inside detail).
  it("ARM_REQUIRED and CONFIRM_REQUIRED carry {error, server} JSON", async () => {
    h = await setup();

    const armRes = await h.callTool("vrc_upload", {
      target: "avatar",
      dry_run: false,
      confirm: true,
    });
    expect(armRes.isError).toBe(true);
    const armJson = JSON.parse(textOf(armRes, 1)) as {
      error: { code: string; detail: { file: string } };
      server: { version: string; pid: number };
    };
    expect(armJson.error.code).toBe("ARM_REQUIRED");
    expect(armJson.error.detail.file).toContain("vrc-upload.arm");
    expect(armJson.server.version).toBe(SERVER_VERSION);
    expect(armJson.server.pid).toBe(process.pid);

    const confirmRes = await h.callTool("vrc_upload", { target: "avatar", dry_run: false });
    expect(confirmRes.isError).toBe(true);
    const confirmJson = JSON.parse(textOf(confirmRes, 1)) as {
      error: { code: string };
      server: { version: string };
    };
    expect(confirmJson.error.code).toBe("CONFIRM_REQUIRED");
    expect(confirmJson.server.version).toBe(SERVER_VERSION);
  });
});

describe("checkArm unit behavior", () => {
  it("reports missing / fresh / expired correctly", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-armunit-"));
    const file = path.join(tmp, "a.arm");
    try {
      expect(checkArm({ armFile: file }).armed).toBe(false);
      fs.writeFileSync(file, "x");
      expect(checkArm({ armFile: file }).armed).toBe(true);
      expect(checkArm({ armFile: file, armTtlMs: 60_000 }).armed).toBe(true);
      const past = new Date(Date.now() - 120_000);
      fs.utimesSync(file, past, past);
      const stale = checkArm({ armFile: file, armTtlMs: 60_000 });
      expect(stale.armed).toBe(false);
      expect(stale.detail).toContain("expired");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
