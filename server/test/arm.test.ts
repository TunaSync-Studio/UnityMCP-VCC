// Human arm gate: a real vrc_upload needs confirm:true AND a fresh one-shot
// arm file. The server only pre-checks the arm; the Unity plugin is the single
// consumer (atomic claim right before the upload). The mock emulates the
// plugin-side gate of each plugin generation. Self-contained harness (same
// shape as confirm.test.ts).
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
import { MockPlugin, type MockPluginOptions } from "./mock-plugin.js";

interface Harness {
  mock: MockPlugin;
  armFile: string;
  callTool: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;
  cleanup: () => Promise<void>;
}

/** Wire feature a plugin advertises when it claims the arm itself. */
const ARM_CLAIM_FEATURE = "vrcUploadArmClaim";

/**
 * Plugin generations the server can meet:
 * - "claim": fixed plugin - advertises the feature and claims the arm.
 * - "readOnlyCheck": 2.6.7-2.6.8 - checks the arm read-only, no feature.
 * - "noCheck": <= 2.6.6 - no plugin-side arm gate at all, no feature.
 */
type PluginKind = "claim" | "readOnlyCheck" | "noCheck";

const OLD_PLUGIN_VERSION: Record<Exclude<PluginKind, "claim">, string> = {
  readOnlyCheck: "2.6.8",
  noCheck: "2.6.6",
};

async function setup(
  kind: PluginKind = "claim",
  extra: Partial<MockPluginOptions> = {},
): Promise<Harness> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-arm-"));
  const armFile = path.join(tmp, "vrc-upload.arm");
  const pluginOpts: Partial<MockPluginOptions> =
    kind === "claim"
      ? { features: [ARM_CLAIM_FEATURE], armGate: { file: armFile, mode: "claim" } }
      : kind === "readOnlyCheck"
        ? { pluginVersion: OLD_PLUGIN_VERSION.readOnlyCheck, armGate: { file: armFile, mode: "check" } }
        : { pluginVersion: OLD_PLUGIN_VERSION.noCheck };
  const mock = new MockPlugin({ registryDir: tmp, ...pluginOpts, ...extra });
  await mock.start();
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

function submitCount(mock: MockPlugin): number {
  return mock.received.reqs.filter((r) => r.method === "job.submit").length;
}

const REAL_UPLOAD = { target: "avatar", dry_run: false, confirm: true, timeout_ms: 2_000 };

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

  it("armed + confirmed real upload completes; the plugin consumes the arm (one-shot)", async () => {
    h = await setup();
    fs.writeFileSync(h.armFile, "armed by test");
    const res = await h.callTool("vrc_upload", REAL_UPLOAD);
    // Regression (2.6.7-2.6.8): the server consumed the arm before submitting
    // the job, so the plugin-side gate refused every real upload.
    expect(res.isError ?? false, textOf(res)).toBe(false);
    expect((JSON.parse(textOf(res)) as { state: string }).state).toBe("completed");
    const submit = h.mock.received.reqs.find((r) => r.method === "job.submit");
    expect(submit).toBeDefined();
    const params = (submit?.params as { params: Record<string, unknown> }).params;
    expect(params.confirm).toBe(true);
    expect(params.dryRun).toBe(false);
    // Consumed by the plugin's claim, and no claim leftovers next to it.
    expect(fs.existsSync(h.armFile)).toBe(false);
    expect(
      fs.readdirSync(path.dirname(h.armFile)).filter((f) => f.startsWith("vrc-upload.arm")),
    ).toEqual([]);

    // Second attempt without re-arming is refused before anything is submitted.
    const again = await h.callTool("vrc_upload", REAL_UPLOAD);
    expect(again.isError).toBe(true);
    expect(textOf(again)).toContain("ARM_REQUIRED");
    expect(submitCount(h.mock)).toBe(1);
  });

  it("two concurrent armed attempts: exactly one uploads (L-3)", async () => {
    h = await setup();
    fs.writeFileSync(h.armFile, "armed by test");
    const results = await Promise.all([
      h.callTool("vrc_upload", REAL_UPLOAD),
      h.callTool("vrc_upload", REAL_UPLOAD),
    ]);
    const uploaded = results.filter((r) => !(r.isError ?? false));
    const refused = results.filter((r) => r.isError === true);
    expect(uploaded).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(textOf(refused[0]!)).toMatch(/arm/i);
    expect(fs.existsSync(h.armFile)).toBe(false);
  });

  it("the server never consumes the arm, even when the plugin refuses", async () => {
    // The plugin looks at a different arm file (e.g. UNITY_MCP_ARM_FILE set
    // for only one side): the server's pre-check passes, the plugin's claim
    // fails - and the arm the server checked is left in place.
    const tmpOther = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-arm-other-"));
    try {
      h = await setup("claim", {
        armGate: { file: path.join(tmpOther, "vrc-upload.arm"), mode: "claim" },
      });
      fs.writeFileSync(h.armFile, "armed by test");
      const res = await h.callTool("vrc_upload", REAL_UPLOAD);
      expect(res.isError).toBe(true);
      expect(textOf(res)).toContain("arm file not found");
      expect(submitCount(h.mock)).toBe(1);
      expect(fs.existsSync(h.armFile)).toBe(true);
    } finally {
      fs.rmSync(tmpOther, { recursive: true, force: true });
    }
  });

  it.each([
    ["2.6.7-2.6.8, read-only plugin check", "readOnlyCheck"],
    ["<= 2.6.6, no plugin check", "noCheck"],
  ] as const)(
    "refuses a real upload to a plugin without the arm claim (%s): arm untouched, nothing submitted",
    async (_label, kind) => {
      h = await setup(kind);
      fs.writeFileSync(h.armFile, "armed by test");
      const res = await h.callTool("vrc_upload", REAL_UPLOAD);
      expect(res.isError).toBe(true);
      expect(textOf(res)).toContain("PLUGIN_UPDATE_REQUIRED");
      expect(textOf(res)).toContain(OLD_PLUGIN_VERSION[kind]);
      const json = JSON.parse(textOf(res, 1)) as {
        error: { code: string; retryable: boolean; detail: { pluginVersion: string | null } };
        server: { version: string };
      };
      expect(json.error.code).toBe("PLUGIN_UPDATE_REQUIRED");
      expect(json.error.retryable).toBe(false);
      expect(json.error.detail.pluginVersion).toBe(OLD_PLUGIN_VERSION[kind]);
      expect(json.server.version).toBe(SERVER_VERSION);
      expect(fs.existsSync(h.armFile)).toBe(true);
      expect(submitCount(h.mock)).toBe(0);
    },
  );

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

  it("dry_run needs neither confirm nor arm, and leaves an existing arm untouched", async () => {
    h = await setup();
    fs.writeFileSync(h.armFile, "armed by test");
    const res = await h.callTool("vrc_upload", { target: "avatar", dry_run: true, timeout_ms: 2_000 });
    expect(res.isError ?? false).toBe(false);
    expect(submitCount(h.mock)).toBe(1);
    expect(fs.existsSync(h.armFile)).toBe(true);
  });

  it("dry_run still works against a plugin without the arm claim", async () => {
    h = await setup("noCheck");
    const res = await h.callTool("vrc_upload", { target: "avatar", dry_run: true, timeout_ms: 2_000 });
    expect(res.isError ?? false).toBe(false);
    expect(submitCount(h.mock)).toBe(1);
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
