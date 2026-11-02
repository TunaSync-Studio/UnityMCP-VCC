// Registry discovery: fixture files, dead-pid skip, stale mtime, schema
// mismatch, and selector resolution (substring / ambiguous / single default).

import { spawn } from "node:child_process";
import { once } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { UnityMcpError } from "../src/errors.js";
import { pidAlive, resolveProject, scanRegistry } from "../src/discovery.js";

let deadPid = 0;

beforeAll(async () => {
  // Spawn a real process and let it exit: its pid is guaranteed dead.
  const child = spawn(process.execPath, ["-e", "0"], { stdio: "ignore" });
  const pid = child.pid;
  await once(child, "exit");
  deadPid = pid ?? 999_999;
});

interface EntryOverrides {
  schemaVersion?: number;
  port?: number;
  projectPath?: string;
  projectName?: string;
  pid?: number;
}

function writeEntry(dir: string, name: string, o: EntryOverrides): string {
  const file = path.join(dir, name);
  fs.writeFileSync(
    file,
    JSON.stringify({
      schemaVersion: o.schemaVersion ?? 1,
      port: o.port ?? 47700,
      projectPath: o.projectPath ?? "C:/Test/Project",
      projectName: o.projectName ?? "Project",
      pid: o.pid ?? process.pid,
      unityVersion: "2022.3.22f1",
      pluginVersion: "2.0.0",
      protocolV: 1,
      startedAt: new Date().toISOString(),
    }),
    "utf8",
  );
  return file;
}

describe("discovery", () => {
  let tmp: string;
  let cfg: Config;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-disc-"));
    cfg = { projectSelector: undefined, registryDir: tmp, defaultTimeoutMs: 5000 };
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("pidAlive distinguishes the live test process from a dead pid", () => {
    expect(pidAlive(process.pid)).toBe(true);
    expect(pidAlive(deadPid)).toBe(false);
    expect(pidAlive(0)).toBe(false);
    expect(pidAlive(-5)).toBe(false);
  });

  it("scanRegistry flags dead pid, stale mtime and schema mismatch entries", () => {
    writeEntry(tmp, "alive.json", { projectPath: "C:/Proj/Alive", projectName: "Alive" });
    writeEntry(tmp, "deadpid.json", {
      projectPath: "C:/Proj/DeadPid",
      projectName: "DeadPid",
      pid: deadPid,
    });
    writeEntry(tmp, "schema.json", {
      projectPath: "C:/Proj/Schema",
      projectName: "Schema",
      schemaVersion: 2,
    });
    const staleFile = writeEntry(tmp, "stale.json", {
      projectPath: "C:/Proj/Stale",
      projectName: "Stale",
    });
    const past = new Date(Date.now() - 200_000);
    fs.utimesSync(staleFile, past, past);
    fs.writeFileSync(path.join(tmp, "garbage.json"), "not json", "utf8");
    fs.writeFileSync(path.join(tmp, "notes.txt"), "ignored", "utf8");

    const scanned = scanRegistry(cfg);
    expect(scanned).toHaveLength(4); // garbage + txt skipped entirely
    const byName = new Map(scanned.map((d) => [d.entry.projectName, d]));
    expect(byName.get("Alive")?.alive).toBe(true);
    expect(byName.get("DeadPid")?.alive).toBe(false);
    expect(byName.get("DeadPid")?.reason).toBe("pid_dead");
    expect(byName.get("Schema")?.alive).toBe(false);
    expect(byName.get("Schema")?.reason).toBe("schema_mismatch");
    expect(byName.get("Stale")?.alive).toBe(false);
    expect(byName.get("Stale")?.reason).toBe("unresponsive");
  });

  it("resolves the single alive project when no selector is given", () => {
    writeEntry(tmp, "a.json", { projectPath: "C:/Proj/OnlyOne", projectName: "OnlyOne" });
    writeEntry(tmp, "dead.json", {
      projectPath: "C:/Proj/Dead",
      projectName: "Dead",
      pid: deadPid,
    });
    const entry = resolveProject(cfg);
    expect(entry.projectName).toBe("OnlyOne");
  });

  it("throws PROJECT_AMBIGUOUS with candidates when several are alive and no selector", () => {
    writeEntry(tmp, "a.json", { projectPath: "C:/Proj/A", projectName: "ProjA", port: 47701 });
    writeEntry(tmp, "b.json", { projectPath: "C:/Proj/B", projectName: "ProjB", port: 47702 });
    let err: unknown = null;
    try {
      resolveProject(cfg);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UnityMcpError);
    const u = err as UnityMcpError;
    expect(u.code).toBe("PROJECT_AMBIGUOUS");
    const detail = u.obj.detail as { candidates: Array<{ projectName: string }> };
    expect(detail.candidates).toHaveLength(2);
  });

  it("matches by exact normalized path (backslashes, trailing slash, case)", () => {
    writeEntry(tmp, "a.json", { projectPath: "C:/UnityProjects/Sample Alpha Project", projectName: "Alpha" });
    writeEntry(tmp, "b.json", { projectPath: "C:/Proj/Other", projectName: "Other" });
    const entry = resolveProject(cfg, "C:\\UNITYPROJECTS\\SAMPLE ALPHA PROJECT\\");
    expect(entry.projectName).toBe("Alpha");
  });

  it("matches by path or name substring", () => {
    writeEntry(tmp, "a.json", { projectPath: "C:/UnityProjects/BetaTown", projectName: "beta Project" });
    writeEntry(tmp, "b.json", { projectPath: "C:/Proj/Other", projectName: "Other" });
    expect(resolveProject(cfg, "betatown").projectName).toBe("beta Project");
    expect(resolveProject(cfg, "beta").projectName).toBe("beta Project");
  });

  it("throws PROJECT_AMBIGUOUS when a substring matches several projects", () => {
    writeEntry(tmp, "a.json", { projectPath: "C:/VRChat/AvatarA", projectName: "AvatarA" });
    writeEntry(tmp, "b.json", { projectPath: "C:/VRChat/AvatarB", projectName: "AvatarB" });
    let code = "";
    try {
      resolveProject(cfg, "avatar");
    } catch (e) {
      code = (e as UnityMcpError).code;
    }
    expect(code).toBe("PROJECT_AMBIGUOUS");
  });

  it("throws PROJECT_NOT_FOUND for an unmatched selector and an empty registry", () => {
    writeEntry(tmp, "a.json", { projectPath: "C:/Proj/A", projectName: "ProjA" });
    let code = "";
    try {
      resolveProject(cfg, "does-not-exist");
    } catch (e) {
      code = (e as UnityMcpError).code;
    }
    expect(code).toBe("PROJECT_NOT_FOUND");

    fs.rmSync(path.join(tmp, "a.json"));
    let code2 = "";
    try {
      resolveProject(cfg);
    } catch (e) {
      code2 = (e as UnityMcpError).code;
    }
    expect(code2).toBe("PROJECT_NOT_FOUND");
  });

  it("ignores a dead-pid entry even when it matches the selector", () => {
    writeEntry(tmp, "dead.json", {
      projectPath: "C:/Proj/Target",
      projectName: "Target",
      pid: deadPid,
    });
    let code = "";
    try {
      resolveProject(cfg, "target");
    } catch (e) {
      code = (e as UnityMcpError).code;
    }
    expect(code).toBe("PROJECT_NOT_FOUND");
  });

  function codeOf(fn: () => unknown): string {
    try {
      fn();
    } catch (e) {
      return (e as UnityMcpError).code;
    }
    return "no error";
  }

  it("a full-path selector never falls back to a project whose path merely contains it", () => {
    // The pool pins clients by full path and re-resolves on reconnect: while
    // ".../Avatar" is restarting, it must not drift to ".../Avatar2".
    writeEntry(tmp, "a.json", { projectPath: "C:/Projects/Avatar", projectName: "Avatar", pid: deadPid });
    writeEntry(tmp, "b.json", { projectPath: "C:/Projects/Avatar2", projectName: "Avatar2" });
    expect(codeOf(() => resolveProject(cfg, "C:/Projects/Avatar"))).toBe("PROJECT_NOT_FOUND");
    fs.rmSync(path.join(tmp, "a.json")); // not even registered
    expect(codeOf(() => resolveProject(cfg, "C:\\Projects\\Avatar"))).toBe("PROJECT_NOT_FOUND");
    expect(resolveProject(cfg, "C:/Projects/Avatar2").projectName).toBe("Avatar2");
  });

  it("a blocked exact project reports unresponsive instead of matching a sibling", () => {
    const stale = writeEntry(tmp, "a.json", { projectPath: "C:/Projects/Avatar", projectName: "Avatar" });
    const past = new Date(Date.now() - 200_000);
    fs.utimesSync(stale, past, past);
    writeEntry(tmp, "b.json", { projectPath: "C:/Projects/Avatar2", projectName: "Avatar2" });
    const code = codeOf(() => resolveProject(cfg, "C:/Projects/Avatar"));
    expect(code).not.toBe("no error");
    expect(code).not.toBe("PROJECT_NOT_FOUND");
    expect(codeOf(() => resolveProject(cfg, "Avatar"))).toBe(code);
  });

  it("a trailing path matches at a folder boundary only", () => {
    writeEntry(tmp, "a.json", { projectPath: "D:/Work/Projects/Avatar", projectName: "Avatar" });
    writeEntry(tmp, "b.json", { projectPath: "D:/Work/Projects/Avatar2", projectName: "Avatar2" });
    expect(resolveProject(cfg, "Projects/Avatar").projectName).toBe("Avatar");
    expect(resolveProject(cfg, "projects\\avatar2").projectName).toBe("Avatar2");
    expect(codeOf(() => resolveProject(cfg, "Projects/Ava"))).toBe("PROJECT_NOT_FOUND");
  });

  it("a bare name prefers the exact project over substring matches", () => {
    writeEntry(tmp, "a.json", { projectPath: "C:/VRChat/Avatar", projectName: "Avatar" });
    writeEntry(tmp, "b.json", { projectPath: "C:/VRChat/Avatar2", projectName: "Avatar2" });
    expect(resolveProject(cfg, "avatar").projectName).toBe("Avatar"); // was PROJECT_AMBIGUOUS
    expect(resolveProject(cfg, "Avatar2").projectName).toBe("Avatar2");
  });

  it("a bare name whose exact project is down does not fall back to a sibling", () => {
    writeEntry(tmp, "a.json", { projectPath: "C:/VRChat/Avatar", projectName: "Avatar", pid: deadPid });
    writeEntry(tmp, "b.json", { projectPath: "C:/VRChat/Avatar2", projectName: "Avatar2" });
    expect(codeOf(() => resolveProject(cfg, "Avatar"))).toBe("PROJECT_NOT_FOUND");
    // A fragment that names no project exactly still substring-matches.
    expect(resolveProject(cfg, "atar2").projectName).toBe("Avatar2");
  });

  it("an absolute path matches only that location; a relative path matches whole folders", () => {
    writeEntry(tmp, "a.json", { projectPath: "D:/Work/VRChat/Manuka/Manuka_Project", projectName: "Manuka" });
    writeEntry(tmp, "b.json", { projectPath: "D:/Work/VRChat/Avatar2", projectName: "Avatar2" });
    expect(resolveProject(cfg, "VRChat/Manuka").projectName).toBe("Manuka"); // mid-path fragment
    expect(resolveProject(cfg, "Work/VRChat/Manuka/Manuka_Project").projectName).toBe("Manuka");
    expect(codeOf(() => resolveProject(cfg, "D:/Work/VRChat/Manuka"))).toBe("PROJECT_NOT_FOUND"); // absolute: exact only
    expect(codeOf(() => resolveProject(cfg, "VRChat/Ava"))).toBe("PROJECT_NOT_FOUND"); // never part of a folder name
    // A trailing separator still makes it a path: "VRChat/" is a folder, not a name fragment.
    expect(codeOf(() => resolveProject(cfg, "VRChat/"))).toBe("PROJECT_AMBIGUOUS");
  });

  it("a schema-mismatched exact project is reported as such, not substituted", () => {
    writeEntry(tmp, "a.json", { projectPath: "C:/P/Avatar", projectName: "Avatar", schemaVersion: 2 });
    writeEntry(tmp, "b.json", { projectPath: "C:/P/Avatar2", projectName: "Avatar2" });
    let message = "";
    try {
      resolveProject(cfg, "Avatar");
    } catch (e) {
      message = (e as UnityMcpError).message;
    }
    expect(message).toContain("incompatible plugin version");
  });

  it("returns an empty scan for a missing registry directory", () => {
    const missing: Config = {
      projectSelector: undefined,
      registryDir: path.join(tmp, "does", "not", "exist"),
      defaultTimeoutMs: 5000,
    };
    expect(scanRegistry(missing)).toEqual([]);
  });
});
