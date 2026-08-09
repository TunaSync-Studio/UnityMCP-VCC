// End-to-end tool tests through a real MCP client over InMemoryTransport:
// snake_case -> camelCase wire mapping, the job flow (submit -> wait with
// progress; TIMEOUT reports the jobId without cancelling), eval run_as_job,
// health wake passthrough and find_recipe.

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

function textOf(res: CallToolResult, i = 0): string {
  const c = res.content[i];
  if (!c || c.type !== "text") throw new Error(`expected text content at index ${i}`);
  return c.text;
}

function jsonOf(res: CallToolResult, i = 0): Record<string, unknown> {
  return JSON.parse(textOf(res, i)) as Record<string, unknown>;
}

interface Harness {
  tmp: string;
  mock: MockPlugin;
  mcp: Client;
  callTool: (
    name: string,
    args: Record<string, unknown>,
    onprogress?: (p: unknown) => void,
  ) => Promise<CallToolResult>;
  cleanup: () => Promise<void>;
}

async function setup(mockOpts?: Partial<MockPluginOptions>, recipesDir?: string): Promise<Harness> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-tools-"));
  const mock = new MockPlugin({ registryDir: tmp, ...mockOpts });
  await mock.start();
  const cfg: Config = { projectSelector: undefined, registryDir: tmp, defaultTimeoutMs: 5000 };
  const pool = new ProjectPool(cfg);
  const recipes = new RecipeLibrary(recipesDir ?? path.join(tmp, "no-recipes-here"));
  const server = createMcpServer({ pool, cfg, recipes });
  const mcp = new Client({ name: "tools-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)]);
  const callTool: Harness["callTool"] = async (name, args, onprogress) => {
    const res = await mcp.callTool(
      { name, arguments: args },
      undefined,
      onprogress ? { onprogress } : {},
    );
    return res as CallToolResult;
  };
  const cleanup = async (): Promise<void> => {
    await mcp.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    pool.disposeAll();
    await mock.stop();
    fs.rmSync(tmp, { recursive: true, force: true });
  };
  return { tmp, mock, mcp, callTool, cleanup };
}

describe("tools over MCP", () => {
  let h: Harness | null = null;

  afterEach(async () => {
    if (h) await h.cleanup();
    h = null;
  });

  it("get_editor_state maps snake_case args to camelCase wire params", async () => {
    h = await setup();
    const res = await h.callTool("get_editor_state", {
      sections: ["summary", "hierarchy"],
      max_bytes: 1234,
      hierarchy_depth: 2,
    });
    expect(res.isError).toBeFalsy();
    const req = h.mock.received.reqs.find((r) => r.method === "state.get");
    expect(req).toBeDefined();
    expect(req?.params).toEqual({
      sections: ["summary", "hierarchy"],
      maxBytes: 1234,
      hierarchyDepth: 2,
    });
    // default max_bytes applies when omitted
    await h.callTool("get_editor_state", {});
    const req2 = h.mock.received.reqs.filter((r) => r.method === "state.get")[1];
    expect(req2?.params).toEqual({ maxBytes: 30_000 });
  });

  it("scene_query passes query/type/under and defaults limit to 50", async () => {
    h = await setup();
    await h.callTool("scene_query", { query: "t:Light", type: "Light", under: "/Env", limit: 7 });
    await h.callTool("scene_query", { query: "Player" });
    const reqs = h.mock.received.reqs.filter((r) => r.method === "scene.query");
    expect(reqs[0]?.params).toEqual({ query: "t:Light", type: "Light", under: "/Env", limit: 7 });
    expect(reqs[1]?.params).toEqual({ query: "Player", limit: 50 });
  });

  it("camera_capture maps output_path/focus_target and returns the PNG path as text", async () => {
    h = await setup();
    const res = await h.callTool("camera_capture", {
      view: "game",
      width: 800,
      height: 600,
      output_path: "C:/Temp/out.png",
      focus_target: "Avatar",
    });
    const req = h.mock.received.reqs.find((r) => r.method === "camera.capture");
    expect(req?.params).toEqual({
      view: "game",
      width: 800,
      height: 600,
      outputPath: "C:/Temp/out.png",
      focusTarget: "Avatar",
    });
    // Mock replies with path C:/Temp/mock-capture.png; first content is the path.
    expect(textOf(res, 0)).toBe("C:/Temp/mock-capture.png");
  });

  it("ndmf_bake_run runs the job flow with progress forwarded to MCP", async () => {
    h = await setup({
      jobBehaviors: {
        "ndmf.bake": { progressSteps: 3, stepDelayMs: 10, result: { baked: true } },
      },
    });
    const progressHits: unknown[] = [];
    const res = await h.callTool(
      "ndmf_bake_run",
      { avatar: "Assets/Avatar.prefab", output_dir: "Out", timeout_ms: 5000 },
      (p) => progressHits.push(p),
    );
    expect(res.isError).toBeFalsy();
    const body = jsonOf(res);
    expect(body.state).toBe("completed");
    expect((body.result as Record<string, unknown>).baked).toBe(true);

    const submit = h.mock.received.reqs.find((r) => r.method === "job.submit");
    expect(submit?.params).toEqual({
      method: "ndmf.bake",
      params: { avatarPath: "Assets/Avatar.prefab", outputDir: "Out" },
    });
    const wait = h.mock.received.reqs.find((r) => r.method === "job.wait");
    expect(wait).toBeDefined();
    expect((wait?.params as Record<string, unknown>).jobId).toBe(body.jobId);
    // Plugin progress frames were bridged into MCP progress notifications.
    expect(progressHits.length).toBeGreaterThanOrEqual(1);
  });

  it("job wait TIMEOUT reports the jobId and does NOT cancel implicitly", async () => {
    h = await setup({
      jobBehaviors: { "vrc.upload": { neverComplete: true } },
    });
    const res = await h.callTool("vrc_upload", {
      target: "avatar",
      object_name: "SampleAvatar",
      dry_run: true,
      timeout_ms: 250,
    });
    expect(res.isError).toBeFalsy();
    const body = jsonOf(res);
    expect(body.status).toBe("wait_timeout");
    expect(typeof body.jobId).toBe("string");
    expect(String(body.message)).toContain("NOT cancelled");

    const submit = h.mock.received.reqs.find((r) => r.method === "job.submit");
    expect(submit?.params).toEqual({
      method: "vrc.upload",
      params: { target: "avatar", objectName: "SampleAvatar", dryRun: true, confirm: false },
    });
    // No implicit job.cancel was sent.
    expect(h.mock.received.reqs.some((r) => r.method === "job.cancel")).toBe(false);
  });

  it("execute_editor_command run_as_job submits then waits for the eval job", async () => {
    h = await setup();
    const res = await h.callTool("execute_editor_command", {
      code: "return 42;",
      run_as_job: true,
      timeout_ms: 5000,
    });
    expect(res.isError).toBeFalsy();
    const body = jsonOf(res);
    expect(body.state).toBe("completed");
    expect((body.result as Record<string, unknown>).result).toBe("mock-eval");

    const evalReq = h.mock.received.reqs.find((r) => r.method === "eval.run");
    expect((evalReq?.params as Record<string, unknown>).runAsJob).toBe(true);
    expect(h.mock.received.reqs.some((r) => r.method === "job.wait")).toBe(true);
  });

  it("execute_editor_command without run_as_job stays inline", async () => {
    h = await setup();
    const res = await h.callTool("execute_editor_command", { code: "return 1;" });
    const body = jsonOf(res);
    expect(body.result).toBe("mock-eval");
    const evalReq = h.mock.received.reqs.find((r) => r.method === "eval.run");
    expect((evalReq?.params as Record<string, unknown>).runAsJob).toBeUndefined();
    expect(h.mock.received.reqs.some((r) => r.method === "job.wait")).toBe(false);
  });

  it("unity_health_check wake:true passes through to editor.wake; verbose adds registry+sysInfo", async () => {
    h = await setup();
    const res = await h.callTool("unity_health_check", { wake: true });
    const body = jsonOf(res);
    expect(body.status).toBe("ok");
    expect(body.wake).toBe("ok");
    expect(body.registry).toBeUndefined();
    expect(h.mock.received.reqs.some((r) => r.method === "editor.wake")).toBe(true);

    const verbose = jsonOf(await h.callTool("unity_health_check", { verbose: true }));
    expect(verbose.registry).toBeDefined();
    expect(verbose.sysInfo).toBeDefined();
    expect(verbose.wake).toBeUndefined();
  });

  // F-21 regression: sys.status answers on the plugin's transport thread, so
  // a frozen main thread still returns it - the verdict must come from
  // lastTickAgoMs (same 3000 ms threshold as the plugin's BUSY_MODAL
  // watchdog), not from the mere success of the probe.
  it("unity_health_check reports a stalled main thread as unresponsive", async () => {
    h = await setup({
      handlers: {
        "sys.status": () => ({
          compiling: false,
          playMode: false,
          lastTickAgoMs: 45361,
          jobs: { running: 0 },
          lease: {},
        }),
      },
    });
    const body = jsonOf(await h.callTool("unity_health_check", {}));
    expect(body.status).toBe("unresponsive");
    expect(String(body.detail)).toContain("45361 ms");
    expect(String(body.detail)).toContain("3000 ms");
    const sys = body.sysStatus as Record<string, unknown>;
    expect(sys.lastTickAgoMs).toBe(45361);
    expect((body.server as Record<string, unknown>).version).toBeDefined();
  });

  it("vrc_avatar_audit passes avatar/checks through", async () => {
    h = await setup();
    await h.callTool("vrc_avatar_audit", { avatar: "SampleAvatar", checks: ["physbones", "poly"] });
    const req = h.mock.received.reqs.find((r) => r.method === "vrc.avatarAudit");
    expect(req?.params).toEqual({ avatar: "SampleAvatar", checks: ["physbones", "poly"] });
  });

  it("find_recipe returns the full body for an exact name and a clear message when unbuilt", async () => {
    const recipesDir = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-recfix-"));
    try {
      fs.mkdirSync(path.join(recipesDir, "cat"), { recursive: true });
      fs.writeFileSync(
        path.join(recipesDir, "_index.json"),
        JSON.stringify([
          {
            name: "spin_cube",
            category: "cat",
            tags: ["demo"],
            description: "Spin a cube",
            path: "cat/spin_cube.md",
          },
        ]),
        "utf8",
      );
      fs.writeFileSync(path.join(recipesDir, "cat", "spin_cube.md"), "# spin_cube\nBody.\n", "utf8");

      h = await setup({}, recipesDir);
      const exact = await h.callTool("find_recipe", { query: "spin_cube" });
      expect(textOf(exact)).toBe("# spin_cube\nBody.\n");

      const ranked = jsonOf(await h.callTool("find_recipe", { query: "cube", names_only: true }));
      expect(ranked.totalMatches).toBe(1);
      await h.cleanup();
      h = null;

      // Second harness with a recipes dir that has no index.
      h = await setup();
      const missing = jsonOf(await h.callTool("find_recipe", { query: "anything" }));
      expect(missing.available).toBe(false);
      expect(String(missing.message)).toContain("not built yet");
    } finally {
      fs.rmSync(recipesDir, { recursive: true, force: true });
    }
  });

  it("lists all 18 tools", async () => {
    h = await setup();
    const listed = await h.mcp.listTools();
    const names = listed.tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "asset_import",
        "camera_capture",
        "execute_editor_command",
        "find_recipe",
        "get_editor_state",
        "get_logs",
        "job_cancel",
        "job_status",
        "ndmf_bake_run",
        "scene_query",
        "session_lease",
        "unity_editor",
        "unity_health_check",
        "vcc_project",
        "vpm_manage",
        "vrc_avatar_audit",
        "vrc_menu",
        "vrc_upload",
      ].sort(),
    );
    expect(names).toHaveLength(18);
  });

  it("exposes recipes as recipe:// resources", async () => {
    const recipesDir = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-recres-"));
    try {
      fs.mkdirSync(path.join(recipesDir, "cat"), { recursive: true });
      fs.writeFileSync(
        path.join(recipesDir, "_index.json"),
        JSON.stringify([
          {
            name: "spin_cube",
            category: "cat",
            tags: [],
            description: "Spin a cube",
            path: "cat/spin_cube.md",
          },
        ]),
        "utf8",
      );
      fs.writeFileSync(path.join(recipesDir, "cat", "spin_cube.md"), "# spin\n", "utf8");
      h = await setup({}, recipesDir);
      const templates = await h.mcp.listResourceTemplates();
      expect(templates.resourceTemplates.some((t) => t.uriTemplate.startsWith("recipe://"))).toBe(
        true,
      );
      const list = await h.mcp.listResources();
      const uri = list.resources.find((r) => r.name === "spin_cube")?.uri;
      expect(uri).toBe("recipe://cat/spin_cube");
      const read = await h.mcp.readResource({ uri: uri ?? "" });
      const first = read.contents[0];
      expect(first && "text" in first ? first.text : "").toBe("# spin\n");
    } finally {
      fs.rmSync(recipesDir, { recursive: true, force: true });
    }
  });
});
