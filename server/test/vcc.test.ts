// VCC/VPM layer (v2.4.0): pure-file reads (no vrc-get), the action->argv
// mapping, and the vpm_manage tool end-to-end with an injected fake runner.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "../src/config.js";
import { createMcpServer } from "../src/mcp/server.js";
import { setVpmRunner } from "../src/mcp/tools.js";
import { RecipeLibrary } from "../src/recipes.js";
import { ProjectPool } from "../src/unity/pool.js";
import {
  VrcGetTimeoutError,
  defaultRunner,
  listProjects,
  projectInfo,
  vpmActionSpec,
} from "../src/vcc.js";
import type { VrcGetResult } from "../src/vcc.js";

function textOf(res: CallToolResult, i = 0): string {
  const c = res.content[i];
  if (!c || c.type !== "text") throw new Error("expected text content");
  return c.text;
}

function makeProject(root: string, name: string, unity = "2022.3.22f1"): string {
  const p = path.join(root, name);
  fs.mkdirSync(path.join(p, "ProjectSettings"), { recursive: true });
  fs.writeFileSync(
    path.join(p, "ProjectSettings", "ProjectVersion.txt"),
    `m_EditorVersion: ${unity}\n`,
  );
  fs.mkdirSync(path.join(p, "Packages"), { recursive: true });
  fs.writeFileSync(
    path.join(p, "Packages", "vpm-manifest.json"),
    JSON.stringify({
      dependencies: { "com.vrchat.avatars": { version: "3.10.3" } },
      locked: {
        "com.vrchat.avatars": { version: "3.10.3", dependencies: { "com.vrchat.base": "3.10.3" } },
        "com.vrchat.base": { version: "3.10.3" },
      },
    }),
  );
  return p;
}

describe("vcc file reads", () => {
  it("treats a temporarily malformed settings file as an empty read", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-vcc-broken-"));
    try {
      const settings = path.join(tmp, "settings.json");
      fs.writeFileSync(settings, '{"userProjects": [');
      expect(listProjects(settings)).toEqual({ settingsPath: settings, projects: [] });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("listProjects reads userProjects and flags missing dirs", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-vcc-"));
    try {
      const real = makeProject(tmp, "RealProject");
      const settings = path.join(tmp, "settings.json");
      fs.writeFileSync(
        settings,
        JSON.stringify({ userProjects: [real, path.join(tmp, "GoneProject")] }),
      );
      const out = listProjects(settings);
      expect(out.projects).toHaveLength(2);
      const a = out.projects[0]!;
      const b = out.projects[1]!;
      expect(a.name).toBe("RealProject");
      expect(a.exists).toBe(true);
      expect(a.unityVersion).toBe("2022.3.22f1");
      expect(a.hasVpmManifest).toBe(true);
      expect(b.exists).toBe(false);
      expect(b.unityVersion).toBeNull();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("projectInfo reads locked packages sorted and flags legacy folders", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-vccinfo-"));
    try {
      const p = makeProject(tmp, "P");
      fs.mkdirSync(path.join(p, "Assets", "UnityMCPPlugin"), { recursive: true });
      const info = projectInfo(p);
      expect(info.packages.map((x) => x.name)).toEqual([
        "com.vrchat.avatars",
        "com.vrchat.base",
      ]);
      expect(info.packages[0]!.locked).toBe("3.10.3");
      expect(info.legacyAssetsFolders).toEqual(["UnityMCPPlugin"]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("vpmActionSpec", () => {
  it("maps actions to vrc-get argv", () => {
    expect(vpmActionSpec("repos", {}).args).toEqual(["repo", "list"]);
    expect(vpmActionSpec("add", { project: "P", package: "com.x", version: "1.2.3" })).toEqual({
      args: ["install", "-y", "--project", "P", "com.x", "1.2.3"],
      json: false,
      write: true,
    });
    expect(vpmActionSpec("outdated", { project: "P" }).json).toBe(true);
  });

  it("throws on missing params and unknown actions", () => {
    expect(() => vpmActionSpec("add", { project: "P" })).toThrow(/'package' is required/);
    expect(() => vpmActionSpec("outdated", {})).toThrow(/'project' is required/);
    expect(() => vpmActionSpec("nope", {})).toThrow(/unknown action/);
  });
});

describe("vpm_manage over MCP (injected runner)", () => {
  let cleanup: (() => Promise<void>) | null = null;

  afterEach(async () => {
    setVpmRunner(defaultRunner);
    if (cleanup) await cleanup();
    cleanup = null;
  });

  async function setup(): Promise<{
    callTool: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;
  }> {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-vpm-"));
    const cfg: Config = { projectSelector: undefined, registryDir: tmp, defaultTimeoutMs: 5000 };
    const pool = new ProjectPool(cfg);
    const recipes = new RecipeLibrary(path.join(tmp, "none"));
    const server = createMcpServer({ pool, cfg, recipes });
    const mcp = new Client({ name: "vcc-test", version: "0.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), mcp.connect(ct)]);
    cleanup = async () => {
      await mcp.close().catch(() => undefined);
      await server.close().catch(() => undefined);
      pool.disposeAll();
      fs.rmSync(tmp, { recursive: true, force: true });
    };
    return {
      callTool: async (name, args) =>
        (await mcp.callTool({ name, arguments: args }, undefined, {})) as CallToolResult,
    };
  }

  it("runs an action through the runner and returns command + output", async () => {
    const h = await setup();
    const calls: string[][] = [];
    setVpmRunner(async (args): Promise<VrcGetResult> => {
      calls.push(args);
      return { code: 0, stdout: "https://vpm.example/index.json | Example Repo\n", stderr: "" };
    });
    const res = await h.callTool("vpm_manage", { action: "repos" });
    expect(res.isError ?? false).toBe(false);
    const body = JSON.parse(textOf(res)) as { command: string; exitCode: number; output: string };
    expect(body.command).toBe("vrc-get repo list");
    expect(body.exitCode).toBe(0);
    expect(body.output).toContain("Example Repo");
    expect(calls).toHaveLength(1);
  });

  it("parses JSON actions and surfaces non-zero exits as VRC_GET_FAILED with server identity", async () => {
    const h = await setup();
    setVpmRunner(async (args): Promise<VrcGetResult> =>
      args[0] === "outdated"
        ? { code: 0, stdout: '{"outdated":[]}', stderr: "" }
        : { code: 1, stdout: "", stderr: "no such package" },
    );
    const okRes = await h.callTool("vpm_manage", { action: "outdated", project: "P" });
    const okBody = JSON.parse(textOf(okRes)) as { result: { outdated: unknown[] } };
    expect(okBody.result.outdated).toEqual([]);

    const bad = await h.callTool("vpm_manage", {
      action: "add",
      project: "P",
      package: "com.nope",
    });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toContain("VRC_GET_FAILED");
    const err = JSON.parse(textOf(bad, 1)) as {
      error: { code: string; detail: { stderr: string } };
      server: { version: string };
    };
    expect(err.error.code).toBe("VRC_GET_FAILED");
    expect(err.error.detail.stderr).toContain("no such package");
    expect(err.server.version).toBeDefined();
  });

  it("vcc_project info without project_path is INVALID_PARAMS", async () => {
    const h = await setup();
    const res = await h.callTool("vcc_project", { action: "info" });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("INVALID_PARAMS");
  });

  // F-22: vrc-get's benign "nothing to do" exit 1 is a success-equivalent.
  it("maps 'nothing to do' exits to ok({noop:true})", async () => {
    const h = await setup();
    setVpmRunner(async (): Promise<VrcGetResult> => ({
      code: 1,
      stdout: "",
      stderr: "nothing to do\n",
    }));
    const res = await h.callTool("vpm_manage", {
      action: "add",
      project: "P",
      package: "com.x",
    });
    expect(res.isError ?? false).toBe(false);
    const body = JSON.parse(textOf(res)) as { noop: boolean; exitCode: number };
    expect(body.noop).toBe(true);
    expect(body.exitCode).toBe(0);
  });

  // F-23: a timeout kill answers VRC_GET_FAILED with retryable:true, not a
  // generic HANDLER_EXCEPTION.
  it("maps runner timeouts to retryable VRC_GET_FAILED", async () => {
    const h = await setup();
    setVpmRunner(async () => {
      throw new VrcGetTimeoutError(1);
    });
    const res = await h.callTool("vpm_manage", { action: "resolve", project: "P" });
    expect(res.isError).toBe(true);
    const err = JSON.parse(textOf(res, 1)) as {
      error: { code: string; retryable: boolean; detail: { timeoutMs: number } };
      server: { version: string };
    };
    expect(err.error.code).toBe("VRC_GET_FAILED");
    expect(err.error.retryable).toBe(true);
    expect(err.error.detail.timeoutMs).toBe(1);
    expect(err.server.version).toBeDefined();
  });

  // F-24: unknown actions are validated in the handler (not the zod enum) so
  // the {error, server} block survives.
  it("unknown actions get INVALID_PARAMS with server identity", async () => {
    const h = await setup();
    setVpmRunner(async (): Promise<VrcGetResult> => ({ code: 0, stdout: "", stderr: "" }));
    const res = await h.callTool("vpm_manage", { action: "frobnicate" });
    expect(res.isError).toBe(true);
    const err = JSON.parse(textOf(res, 1)) as {
      error: { code: string };
      server: { version: string };
    };
    expect(err.error.code).toBe("INVALID_PARAMS");
    expect(err.server.version).toBeDefined();

    const res2 = await h.callTool("vcc_project", { action: "frobnicate" });
    expect(res2.isError).toBe(true);
    expect(textOf(res2)).toContain("unknown action");
  });

  // F-28: success-path stderr chatter is surfaced as warnings, not stderr.
  it("renames success stderr to warnings", async () => {
    const h = await setup();
    setVpmRunner(async (): Promise<VrcGetResult> => ({
      code: 0,
      stdout: "done",
      stderr: "w: some localized warning\n",
    }));
    const res = await h.callTool("vpm_manage", { action: "resolve", project: "P" });
    const body = JSON.parse(textOf(res)) as { warnings?: string; stderr?: string };
    expect(body.warnings).toContain("localized warning");
    expect(body.stderr).toBeUndefined();
  });

  it("create copies a template, resolves, adds extras and registers in VCC", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-create-"));
    const templates = path.join(tmp, "VRCTemplates");
    fs.mkdirSync(path.join(templates, "Avatar", "ProjectSettings"), { recursive: true });
    fs.mkdirSync(path.join(templates, "Avatar", "Packages"), { recursive: true });
    fs.writeFileSync(
      path.join(templates, "Avatar", "ProjectSettings", "ProjectVersion.txt"),
      "m_EditorVersion: 2022.3.22f1\n",
    );
    fs.writeFileSync(
      path.join(templates, "Avatar", "Packages", "vpm-manifest.json"),
      JSON.stringify({ dependencies: { "com.vrchat.avatars": { version: "~3.10.x" } } }),
    );
    const settings = path.join(tmp, "settings.json");
    fs.writeFileSync(settings, JSON.stringify({ userProjects: [] }));
    process.env.UNITY_MCP_VCC_TEMPLATES = templates;
    process.env.UNITY_MCP_VCC_SETTINGS = settings;
    try {
      const h = await setup();
      const argvLog: string[][] = [];
      setVpmRunner(async (argv): Promise<VrcGetResult> => {
        argvLog.push(argv);
        return { code: 0, stdout: "", stderr: "" };
      });
      const dest = path.join(tmp, "NewAvatarProject");
      const res = await h.callTool("vpm_manage", {
        action: "create",
        project: dest,
        template: "avatar",
        packages: ["nadena.dev.modular-avatar"],
      });
      expect(res.isError ?? false).toBe(false);
      const body = JSON.parse(textOf(res)) as {
        template: string;
        copiedFiles: number;
        steps: Array<{ step: string; exitCode: number }>;
        vccRegistration: { registered: boolean };
      };
      expect(body.template).toBe("Avatar");
      expect(body.copiedFiles).toBe(2);
      expect(body.steps.map((s) => s.step)).toEqual(["resolve", "add nadena.dev.modular-avatar"]);
      expect(argvLog[0]).toEqual(["resolve", "--project", dest]);
      expect(argvLog[1]).toEqual(["install", "-y", "--project", dest, "nadena.dev.modular-avatar"]);
      expect(body.vccRegistration.registered).toBe(true);
      const written = JSON.parse(fs.readFileSync(settings, "utf8")) as { userProjects: string[] };
      expect(written.userProjects).toHaveLength(1);
      expect(fs.existsSync(settings + ".bak-unity-mcp")).toBe(true);
      expect(
        fs.existsSync(path.join(dest, "ProjectSettings", "ProjectVersion.txt")),
      ).toBe(true);

      // Never overwrites: same destination again is INVALID_PARAMS.
      const again = await h.callTool("vpm_manage", { action: "create", project: dest });
      expect(again.isError).toBe(true);
      expect(textOf(again)).toContain("already exists");
    } finally {
      delete process.env.UNITY_MCP_VCC_TEMPLATES;
      delete process.env.UNITY_MCP_VCC_SETTINGS;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("create with an unknown template lists the available ones", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-create2-"));
    fs.mkdirSync(path.join(tmp, "VRCTemplates", "World"), { recursive: true });
    process.env.UNITY_MCP_VCC_TEMPLATES = path.join(tmp, "VRCTemplates");
    try {
      const h = await setup();
      setVpmRunner(async (): Promise<VrcGetResult> => ({ code: 0, stdout: "", stderr: "" }));
      const res = await h.callTool("vpm_manage", {
        action: "create",
        project: path.join(tmp, "X"),
        template: "spaceship",
      });
      expect(res.isError).toBe(true);
      expect(textOf(res)).toContain("Available: World");
    } finally {
      delete process.env.UNITY_MCP_VCC_TEMPLATES;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
