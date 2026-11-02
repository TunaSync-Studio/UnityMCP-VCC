// Default registry / arm locations must match the plugin's
// Environment.SpecialFolder.LocalApplicationData on every platform, or the two
// sides never meet without overrides (macOS/Linux through 2.6.8).
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import { armFilePath } from "../src/armGate.js";
import {
  MAX_ARM_TTL_MIN,
  loadConfig,
  localDataDir,
  parseArmFile,
  parseArmTtlMin,
} from "../src/config.js";
import { readEditorRegistry } from "../src/vcc.js";

const home = os.homedir();

describe("localDataDir (mirrors Unity Mono's LocalApplicationData)", () => {
  it("Windows: LOCALAPPDATA, else ~/AppData/Local", () => {
    expect(localDataDir({ LOCALAPPDATA: "D:\\Data" }, "win32")).toBe("D:\\Data");
    expect(localDataDir({}, "win32")).toBe(path.join(home, "AppData", "Local"));
  });

  it("macOS and Linux: $XDG_DATA_HOME, else ~/.local/share", () => {
    for (const platform of ["darwin", "linux"] as const) {
      expect(localDataDir({}, platform)).toBe(path.join(home, ".local", "share"));
      expect(localDataDir({ XDG_DATA_HOME: "" }, platform)).toBe(path.join(home, ".local", "share"));
      expect(localDataDir({ XDG_DATA_HOME: "/x/data" }, platform)).toBe("/x/data");
    }
  });

  it("an explicit LOCALAPPDATA still wins everywhere (existing workarounds keep working)", () => {
    expect(localDataDir({ LOCALAPPDATA: "/custom", XDG_DATA_HOME: "/x" }, "darwin")).toBe("/custom");
  });

  it("registry and arm defaults are built on it", () => {
    const share = path.join(home, ".local", "share");
    expect(loadConfig({}, "darwin").registryDir).toBe(path.join(share, "UnityMCP", "registry"));
    expect(armFilePath({}, {}, "linux")).toBe(path.join(share, "UnityMCP", "arm", "vrc-upload.arm"));
    expect(armFilePath({}, { LOCALAPPDATA: "C:\\L" }, "win32")).toBe(
      path.join("C:\\L", "UnityMCP", "arm", "vrc-upload.arm"),
    );
    // Overrides are untouched.
    expect(loadConfig({ UNITY_MCP_REGISTRY_DIR: "/r" }, "darwin").registryDir).toBe("/r");
    expect(armFilePath({ armFile: "/a/x.arm" }, {}, "darwin")).toBe("/a/x.arm");
  });
});

describe("the editor lifecycle layer (vcc.ts) reads the same registry folder", () => {
  // Through the first 2.6.9 commit vcc.ts kept the old ~/AppData/Local
  // fallback, so on macOS/Linux unity_editor status/launch saw no editors.
  it.skipIf(process.platform === "win32")("default folder on macOS/Linux", () => {
    const saved = {
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      XDG_DATA_HOME: process.env.XDG_DATA_HOME,
      UNITY_MCP_REGISTRY_DIR: process.env.UNITY_MCP_REGISTRY_DIR,
    };
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-xdg-"));
    try {
      delete process.env.LOCALAPPDATA;
      delete process.env.UNITY_MCP_REGISTRY_DIR;
      process.env.XDG_DATA_HOME = tmp;
      const dir = path.join(tmp, "UnityMCP", "registry");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "a.json"),
        JSON.stringify({ projectPath: "/p/Avatar", projectName: "Avatar", pid: process.pid, port: 47700 }),
      );
      expect(loadConfig(process.env).registryDir).toBe(dir);
      const entries = readEditorRegistry();
      expect(entries.map((e) => e.projectPath)).toEqual(["/p/Avatar"]);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("arm overrides are read exactly like the plugin reads them", () => {
  it("UNITY_MCP_ARM_TTL_MIN: plain positive decimals, capped at 24 h", () => {
    expect(parseArmTtlMin("45")).toBe(45);
    expect(parseArmTtlMin(" 1.5 ")).toBe(1.5);
    expect(parseArmTtlMin("1e3")).toBe(1000);
    expect(parseArmTtlMin("1e10")).toBe(MAX_ARM_TTL_MIN);
    expect(MAX_ARM_TTL_MIN).toBe(1440);
    for (const bad of [undefined, "", "0", "-5", "abc", "Infinity", "NaN", "0x10", "1,5"]) {
      expect(parseArmTtlMin(bad)).toBeUndefined();
    }
    expect(loadConfig({ UNITY_MCP_ARM_TTL_MIN: "1e10" }).armTtlMs).toBe(1440 * 60_000);
  });

  it("UNITY_MCP_ARM_FILE: trimmed, absolute paths only", () => {
    const abs = path.join(os.tmpdir(), "x.arm");
    expect(parseArmFile(`  ${abs}  `)).toBe(abs);
    expect(parseArmFile("relative/x.arm")).toBeUndefined();
    expect(parseArmFile("   ")).toBeUndefined();
    expect(parseArmFile(undefined)).toBeUndefined();
  });
});

