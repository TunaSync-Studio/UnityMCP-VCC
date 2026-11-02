// Default registry / arm locations must match the plugin's
// Environment.SpecialFolder.LocalApplicationData on every platform, or the two
// sides never meet without overrides (macOS/Linux through 2.6.8).
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { armFilePath } from "../src/armGate.js";
import { loadConfig, localDataDir } from "../src/config.js";

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
