// Streaming mode: destructive/publishing tools are locked, everything else
// still works, and user paths / custom terms are masked in tool output.
// Self-contained harness (same shape as confirm.test.ts).
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
import { loadStreamMode, maskText, streamLockReason, streamLockedResult } from "../src/streamMode.js";
import { SERVER_VERSION } from "../src/version.js";
import { MockPlugin, type MockPluginOptions } from "./mock-plugin.js";

// F-27: vcc_project enumerates every project on the machine - locked while
// streaming alongside the destructive tools.
describe("stream locks the VCC layer", () => {
  it("vcc_project and vpm_manage are refused when enabled", () => {
    const on = { enabled: true, masks: [] };
    expect(streamLockReason("vcc_project", {}, on)).toContain("locked");
    expect(streamLockReason("vpm_manage", {}, on)).toContain("locked");
    expect(streamLockReason("get_editor_state", {}, on)).toBeNull();
  });
});

// F-17: the stream-mode refusal carries the same {error, server} JSON block
// as fail() responses.
describe("streamLockedResult server identity", () => {
  it("second content entry is {error:{code:STREAM_MODE_LOCKED}, server:{version,pid}}", () => {
    const res = streamLockedResult("tool 'vrc_upload' is locked while streaming mode is on");
    expect(res.isError).toBe(true);
    const first = res.content[0];
    if (first?.type !== "text") throw new Error("expected text content");
    expect(first.text).toContain("[STREAM_MODE_LOCKED]");
    const second = res.content[1];
    if (second?.type !== "text") throw new Error("expected JSON text content");
    const json = JSON.parse(second.text) as {
      error: { code: string };
      server: { version: string; pid: number };
    };
    expect(json.error.code).toBe("STREAM_MODE_LOCKED");
    expect(json.server.version).toBe(SERVER_VERSION);
    expect(json.server.pid).toBe(process.pid);
  });
});

interface Harness {
  mock: MockPlugin;
  callTool: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;
  cleanup: () => Promise<void>;
}

async function setup(
  streamMasks: string[] = [],
  mockOpts?: Partial<MockPluginOptions>,
): Promise<Harness> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-stream-"));
  const mock = new MockPlugin({ registryDir: tmp, ...mockOpts });
  await mock.start();
  const cfg: Config = {
    projectSelector: undefined,
    registryDir: tmp,
    defaultTimeoutMs: 5000,
    stream: { enabled: true, masks: streamMasks },
  };
  const pool = new ProjectPool(cfg);
  const recipes = new RecipeLibrary(path.join(tmp, "no-recipes-here"));
  const server = createMcpServer({ pool, cfg, recipes });
  const mcp = new Client({ name: "stream-test", version: "0.0.0" });
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

function textOf(res: CallToolResult, i = 0): string {
  const c = res.content[i];
  if (!c || c.type !== "text") throw new Error("expected text content");
  return c.text;
}

function allText(res: CallToolResult): string {
  return res.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

describe("stream mode locks", () => {
  let h: Harness | null = null;

  afterEach(async () => {
    if (h) await h.cleanup();
    h = null;
  });

  it("locks execute_editor_command and sends nothing to the plugin", async () => {
    h = await setup();
    const res = await h.callTool("execute_editor_command", { code: "return 1;" });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("STREAM_MODE_LOCKED");
    expect(h.mock.received.reqs.some((r) => r.method === "eval.run")).toBe(false);
  });

  it("locks vrc_upload entirely, even dry_run", async () => {
    h = await setup();
    const res = await h.callTool("vrc_upload", { target: "avatar", dry_run: true });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("STREAM_MODE_LOCKED");
    expect(h.mock.received.reqs.some((r) => r.method === "job.submit")).toBe(false);
  });

  it("locks ndmf_bake_run", async () => {
    h = await setup();
    const res = await h.callTool("ndmf_bake_run", { avatar: "A" });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("STREAM_MODE_LOCKED");
  });

  it("locks session_lease takeover but allows status", async () => {
    h = await setup();
    const takeover = await h.callTool("session_lease", { action: "takeover" });
    expect(takeover.isError).toBe(true);
    expect(textOf(takeover)).toContain("STREAM_MODE_LOCKED");

    const status = await h.callTool("session_lease", { action: "status" });
    expect(status.isError ?? false).toBe(false);
    expect(h.mock.received.reqs.some((r) => r.method === "lease.status")).toBe(true);
    expect(h.mock.received.reqs.some((r) => r.method === "lease.takeover")).toBe(false);
  });

  it("read tools still work", async () => {
    h = await setup();
    const res = await h.callTool("get_editor_state", { max_bytes: 1000 });
    expect(res.isError ?? false).toBe(false);
    expect(h.mock.received.reqs.some((r) => r.method === "state.get")).toBe(true);
  });
});

describe("stream mode masking", () => {
  let h: Harness | null = null;

  afterEach(async () => {
    if (h) await h.cleanup();
    h = null;
  });

  it("masks user directory segments echoed back in results", async () => {
    h = await setup();
    const res = await h.callTool("scene_query", {
      query: "C:\\Users\\testuser\\Projects\\secret.png",
    });
    const text = allText(res);
    expect(text).not.toContain("testuser");
    expect(text).toContain("****");
  });

  it("masks custom terms from the mask list", async () => {
    h = await setup(["SecretProj"]);
    const res = await h.callTool("scene_query", { query: "SecretProj demo object" });
    const text = allText(res);
    expect(text).not.toContain("SecretProj");
    expect(text).toContain("****");
  });
});

describe("maskText unit behavior", () => {
  const state = { enabled: true, masks: [] as string[] };

  it("masks back-slash, forward-slash and JSON-escaped user paths", () => {
    expect(maskText("C:\\Users\\exampleuser\\x.txt", state)).toBe("C:\\Users\\****\\x.txt");
    expect(maskText("C:/Users/exampleuser/x.txt", state)).toBe("C:/Users/****/x.txt");
    // JSON.stringify form: doubled backslashes
    expect(maskText("C:\\\\Users\\\\exampleuser\\\\x.txt", state)).toBe(
      "C:\\\\Users\\\\****\\\\x.txt",
    );
  });

  it("never touches bare words (TOKEN survives the default rules)", () => {
    expect(maskText("AUTH_TOKEN=abc TOK alone", state)).toBe("AUTH_TOKEN=abc TOK alone");
  });

  it("custom masks are literal replacements (incl. JSON-escaped variants)", () => {
    const s = { enabled: true, masks: ["C:\\Projects\\SecretProject"] };
    expect(maskText("path C:\\Projects\\SecretProject end", s)).toBe("path **** end");
    expect(maskText("json C:\\\\Projects\\\\SecretProject end", s)).toBe("json **** end");
  });

  it("does nothing when disabled", () => {
    expect(maskText("C:\\Users\\exampleuser\\x", { enabled: false, masks: ["exampleuser"] })).toBe(
      "C:\\Users\\exampleuser\\x",
    );
  });
});

describe("loadStreamMode", () => {
  it("parses the env contract", () => {
    expect(loadStreamMode({}).enabled).toBe(false);
    expect(loadStreamMode({ UNITY_MCP_STREAM_MODE: "1" }).enabled).toBe(true);
    expect(loadStreamMode({ UNITY_MCP_STREAM_MODE: "true" }).enabled).toBe(true);
    expect(loadStreamMode({ UNITY_MCP_STREAM_MODE: "0" }).enabled).toBe(false);
    expect(
      loadStreamMode({ UNITY_MCP_STREAM_MODE: "1", UNITY_MCP_STREAM_MASK: "a; b ;;c" }).masks,
    ).toEqual(["a", "b", "c"]);
  });
});
