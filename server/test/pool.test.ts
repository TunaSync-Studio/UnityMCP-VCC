// ProjectPool keeps a selector's meaning for the server session: an editor
// that quits removes its registry entry, so without this a bare name like
// "Avatar" (or "milfy_neo01") silently re-resolved to "Avatar2"
// ("milfy_neo01_jacket") while the meant editor restarted.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { UnityMcpError } from "../src/errors.js";
import { ProjectPool } from "../src/unity/pool.js";

function writeEntry(dir: string, name: string, projectPath: string, projectName: string): string {
  const file = path.join(dir, name);
  fs.writeFileSync(
    file,
    JSON.stringify({
      schemaVersion: 1,
      port: 47700,
      projectPath,
      projectName,
      pid: process.pid,
      unityVersion: "2022.3.22f1",
      pluginVersion: "2.6.9",
      protocolV: 1,
      startedAt: new Date().toISOString(),
    }),
    "utf8",
  );
  return file;
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as UnityMcpError).code;
  }
  return "no error";
}

describe("ProjectPool selector meaning", () => {
  let tmp: string;
  let pool: ProjectPool;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-pool-"));
    const cfg: Config = { projectSelector: undefined, registryDir: tmp, defaultTimeoutMs: 5000 };
    pool = new ProjectPool(cfg);
  });

  afterEach(() => {
    pool.disposeAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("a bare name keeps meaning its project while that editor restarts", () => {
    const a = writeEntry(tmp, "a.json", "C:/VRChat/milfy_neo01", "milfy_neo01");
    writeEntry(tmp, "b.json", "C:/VRChat/milfy_neo01_jacket", "milfy_neo01_jacket");
    expect(pool.resolve("milfy_neo01").entry.projectName).toBe("milfy_neo01");
    fs.rmSync(a); // the editor quit: its registry entry is gone
    const err = (() => {
      try {
        pool.resolve("milfy_neo01");
      } catch (e) {
        return e as UnityMcpError;
      }
      return null;
    })();
    expect(err?.code).toBe("PROJECT_NOT_FOUND");
    expect(err?.message).toContain("C:/VRChat/milfy_neo01");
    // The other project is still reachable by its own name.
    expect(pool.resolve("milfy_neo01_jacket").entry.projectName).toBe("milfy_neo01_jacket");
    // The editor comes back: the selector resolves to it again.
    writeEntry(tmp, "a.json", "C:/VRChat/milfy_neo01", "milfy_neo01");
    expect(pool.resolve("MILFY_NEO01").entry.projectName).toBe("milfy_neo01");
  });

  it("a fragment keeps meaning the project it first matched", () => {
    const a = writeEntry(tmp, "a.json", "C:/VRChat/milfy_neo01", "milfy_neo01");
    expect(pool.resolve("milfy").entry.projectName).toBe("milfy_neo01");
    fs.rmSync(a);
    writeEntry(tmp, "b.json", "C:/VRChat/milfy_neo01_jacket", "milfy_neo01_jacket");
    expect(codeOf(() => pool.resolve("milfy"))).toBe("PROJECT_NOT_FOUND");
  });

  it("no selector is not remembered: it follows the single running editor", () => {
    const a = writeEntry(tmp, "a.json", "C:/P/One", "One");
    expect(pool.resolve().entry.projectName).toBe("One");
    fs.rmSync(a);
    writeEntry(tmp, "b.json", "C:/P/Two", "Two");
    expect(pool.resolve().entry.projectName).toBe("Two");
  });
});
