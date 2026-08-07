// Real vrc_upload must never reach the plugin without explicit confirm.
// Self-contained harness (same shape as tools.test.ts) to avoid cross-test imports.
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
  /** Pinned into cfg so the real %LOCALAPPDATA% arm state can never leak in. */
  armFile: string;
  callTool: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;
  cleanup: () => Promise<void>;
}

async function setup(mockOpts?: Partial<MockPluginOptions>): Promise<Harness> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-confirm-"));
  const mock = new MockPlugin({ registryDir: tmp, ...mockOpts });
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
  const mcp = new Client({ name: "confirm-test", version: "0.0.0" });
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

describe("vrc_upload confirmation gate", () => {
  let h: Harness | null = null;

  afterEach(async () => {
    if (h) await h.cleanup();
    h = null;
  });

  it("refuses a real upload without confirm and submits nothing", async () => {
    h = await setup();
    const res = await h.callTool("vrc_upload", { target: "avatar", dry_run: false });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("CONFIRM_REQUIRED");
    expect(h.mock.received.reqs.some((r) => r.method === "job.submit")).toBe(false);
  });

  it("passes confirm through when the caller opts in (and is armed)", async () => {
    h = await setup();
    fs.writeFileSync(h.armFile, "armed by test"); // human arm gate is covered in arm.test.ts
    await h.callTool("vrc_upload", {
      target: "avatar",
      dry_run: false,
      confirm: true,
      timeout_ms: 2_000,
    });
    const submit = h.mock.received.reqs.find((r) => r.method === "job.submit");
    const params = (submit?.params as { params: Record<string, unknown> }).params;
    expect(params.confirm).toBe(true);
    expect(params.dryRun).toBe(false);
  });

  it("dry_run needs no confirm", async () => {
    h = await setup();
    await h.callTool("vrc_upload", { target: "avatar", dry_run: true, timeout_ms: 2_000 });
    const submit = h.mock.received.reqs.find((r) => r.method === "job.submit");
    const params = (submit?.params as { params: Record<string, unknown> }).params;
    expect(params.dryRun).toBe(true);
    expect(params.confirm).toBe(false);
  });
});
