// Wave-1 coverage for the MCP completeness roadmap (2026-08-09 design doc):
// P1-1 vpm upgrade mapping, P1-2 derived-cache clean + editor liveness gate.
// The P0 items live plugin-side; their wire additions are exercised by the
// existing eval/tool tests plus Unity EditMode coverage.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  cleanDerivedLibrary,
  editorOpenOn,
  projectEditorVersion,
  readEditorRegistry,
  resolveUnityExe,
  vpmActionSpec,
} from "../src/vcc.js";

describe("vpm upgrade spec (P1-1)", () => {
  it("upgrades everything in the project without a package", () => {
    const s = vpmActionSpec("upgrade", { project: "C:/proj" });
    expect(s.args).toEqual(["upgrade", "--project", "C:/proj", "-y"]);
    expect(s.write).toBe(true);
    expect(s.json).toBe(false);
  });

  it("upgrades a single package to an explicit version", () => {
    const s = vpmActionSpec("upgrade", {
      project: "C:/proj",
      package: "com.x.y",
      version: "1.2.3",
    });
    expect(s.args).toEqual(["upgrade", "--project", "C:/proj", "com.x.y", "1.2.3", "-y"]);
  });

  it("requires a project", () => {
    expect(() => vpmActionSpec("upgrade", {})).toThrow(/project/);
  });
});

describe("derived library clean (P1-2)", () => {
  it("removes Bee and ScriptAssemblies but never PackageCache", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-clean-"));
    try {
      for (const d of ["Bee", "ScriptAssemblies", "PackageCache"]) {
        fs.mkdirSync(path.join(tmp, "Library", d), { recursive: true });
        fs.writeFileSync(path.join(tmp, "Library", d, "x.bin"), "x");
      }
      const out = cleanDerivedLibrary(tmp);
      expect(out.cleaned.sort()).toEqual(["Library/Bee", "Library/ScriptAssemblies"]);
      expect(fs.existsSync(path.join(tmp, "Library", "PackageCache"))).toBe(true);
      expect(fs.existsSync(path.join(tmp, "Library", "Bee"))).toBe(false);
      expect(fs.existsSync(path.join(tmp, "Library", "ScriptAssemblies"))).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("reports absent targets instead of failing", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-clean2-"));
    try {
      const out = cleanDerivedLibrary(tmp);
      expect(out.cleaned).toEqual([]);
      expect(out.absent.sort()).toEqual(["Library/Bee", "Library/ScriptAssemblies"]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("editor liveness gate (P1-2)", () => {
  const saved = process.env.UNITY_MCP_REGISTRY_DIR;
  afterEach(() => {
    if (saved === undefined) delete process.env.UNITY_MCP_REGISTRY_DIR;
    else process.env.UNITY_MCP_REGISTRY_DIR = saved;
  });

  it("flags a live pid, ignores dead pids and corrupt entries, matches paths loosely", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-reg-"));
    try {
      process.env.UNITY_MCP_REGISTRY_DIR = tmp;
      fs.writeFileSync(path.join(tmp, "corrupt.json"), "{nope");
      fs.writeFileSync(
        path.join(tmp, "dead.json"),
        JSON.stringify({ projectPath: "C:/proj", pid: 999_999_999 }),
      );
      expect(editorOpenOn("C:/proj").open).toBe(false);

      fs.writeFileSync(
        path.join(tmp, "live.json"),
        JSON.stringify({ projectPath: "c:\\PROJ\\", pid: process.pid }),
      );
      const res = editorOpenOn("C:/proj");
      expect(res.open).toBe(true);
      expect(res.pid).toBe(process.pid);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("answers closed when the registry directory does not exist", () => {
    process.env.UNITY_MCP_REGISTRY_DIR = path.join(os.tmpdir(), "unitymcp-no-such-dir");
    expect(editorOpenOn("C:/proj").open).toBe(false);
  });
});

describe("unity_editor resolution helpers (P1-3)", () => {
  const savedVcc = process.env.UNITY_MCP_VCC_SETTINGS;
  const savedReg = process.env.UNITY_MCP_REGISTRY_DIR;
  afterEach(() => {
    if (savedVcc === undefined) delete process.env.UNITY_MCP_VCC_SETTINGS;
    else process.env.UNITY_MCP_VCC_SETTINGS = savedVcc;
    if (savedReg === undefined) delete process.env.UNITY_MCP_REGISTRY_DIR;
    else process.env.UNITY_MCP_REGISTRY_DIR = savedReg;
  });

  it("reads m_EditorVersion and resolves the exe through VCC settings", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-editor-"));
    try {
      const proj = path.join(tmp, "Proj");
      fs.mkdirSync(path.join(proj, "ProjectSettings"), { recursive: true });
      fs.writeFileSync(
        path.join(proj, "ProjectSettings", "ProjectVersion.txt"),
        "m_EditorVersion: 2022.3.22f1\n",
      );
      expect(projectEditorVersion(proj)).toBe("2022.3.22f1");

      const exe = path.join(tmp, "editors", "2022.3.22f1", "Editor", "Unity.exe");
      fs.mkdirSync(path.dirname(exe), { recursive: true });
      fs.writeFileSync(exe, "");
      const settings = path.join(tmp, "settings.json");
      fs.writeFileSync(settings, JSON.stringify({ unityEditors: [exe] }));
      process.env.UNITY_MCP_VCC_SETTINGS = settings;

      const hit = resolveUnityExe(proj);
      expect(hit.exe).toBe(exe);
      expect(hit.source).toBe("vcc.unityEditors");
      expect(hit.version).toBe("2022.3.22f1");

      const explicitMissing = resolveUnityExe(proj, path.join(tmp, "nope.exe"));
      expect(explicitMissing.exe).toBeNull();
      expect(explicitMissing.source).toBe("editor_path");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("lists registry entries with liveness and skips corrupt files", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-reg2-"));
    try {
      process.env.UNITY_MCP_REGISTRY_DIR = tmp;
      fs.writeFileSync(path.join(tmp, "corrupt.json"), "{nope");
      fs.writeFileSync(
        path.join(tmp, "live.json"),
        JSON.stringify({ projectPath: "C:/a", projectName: "a", pid: process.pid, port: 47701 }),
      );
      fs.writeFileSync(
        path.join(tmp, "dead.json"),
        JSON.stringify({ projectPath: "C:/b", pid: 999_999_999 }),
      );
      const entries = readEditorRegistry();
      expect(entries).toHaveLength(2);
      const live = entries.find((e) => e.projectPath === "C:/a");
      const dead = entries.find((e) => e.projectPath === "C:/b");
      expect(live?.alive).toBe(true);
      expect(live?.port).toBe(47701);
      expect(dead?.alive).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
