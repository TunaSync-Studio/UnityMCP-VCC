// VCC / VPM layer (v2.4.0) - operates BEFORE any Unity Editor is running.
//
// Two dependency tiers, by design:
//   - Reads (vcc_project) parse the VCC settings file and each project's
//     files directly - zero external dependencies.
//   - Writes (vpm_manage) shell out to `vrc-get` (the open-source VPM CLI,
//     also the engine inside ALCOM). Without vrc-get on PATH the write tool
//     fails with VRC_GET_NOT_FOUND and install instructions - we do not
//     reimplement dependency resolution.
//
// Everything here is plain filesystem/process work: no TCP, no plugin.
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface VccProjectEntry {
  path: string;
  name: string;
  exists: boolean;
  unityVersion: string | null;
  hasVpmManifest: boolean;
}

export interface VccProjectInfo extends VccProjectEntry {
  packages: Array<{ name: string; locked: string | null; dependencies?: Record<string, string> }>;
  legacyAssetsFolders: string[];
}

export function vccSettingsPath(): string {
  const override = process.env.UNITY_MCP_VCC_SETTINGS;
  if (override && override.length > 0) return override;
  const localAppData =
    process.env.LOCALAPPDATA && process.env.LOCALAPPDATA.length > 0
      ? process.env.LOCALAPPDATA
      : path.join(os.homedir(), "AppData", "Local");
  return path.join(localAppData, "VRChatCreatorCompanion", "settings.json");
}

function readUnityVersion(projectPath: string): string | null {
  try {
    const t = fs.readFileSync(
      path.join(projectPath, "ProjectSettings", "ProjectVersion.txt"),
      "utf8",
    );
    const m = /m_EditorVersion:\s*(\S+)/.exec(t);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function entryFor(projectPath: string): VccProjectEntry {
  const exists = fs.existsSync(path.join(projectPath, "ProjectSettings"));
  return {
    path: projectPath.replaceAll("\\", "/"),
    name: path.basename(projectPath),
    exists,
    unityVersion: exists ? readUnityVersion(projectPath) : null,
    hasVpmManifest: fs.existsSync(path.join(projectPath, "Packages", "vpm-manifest.json")),
  };
}

/** List the projects VCC knows about (settings.json userProjects). */
export function listProjects(settingsFile: string = vccSettingsPath()): {
  settingsPath: string;
  projects: VccProjectEntry[];
} {
  let raw: string;
  try {
    raw = fs.readFileSync(settingsFile, "utf8");
  } catch {
    return { settingsPath: settingsFile, projects: [] };
  }
  const parsed = JSON.parse(raw) as { userProjects?: string[] };
  const projects = (parsed.userProjects ?? []).map(entryFor);
  return { settingsPath: settingsFile, projects };
}

/** Detailed info for one project - direct file reads, no vrc-get needed. */
export function projectInfo(projectPath: string): VccProjectInfo {
  const entry = entryFor(projectPath);
  const packages: VccProjectInfo["packages"] = [];
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(projectPath, "Packages", "vpm-manifest.json"), "utf8"),
    ) as { locked?: Record<string, { version?: string; dependencies?: Record<string, string> }> };
    for (const [name, v] of Object.entries(manifest.locked ?? {})) {
      packages.push({ name, locked: v.version ?? null, dependencies: v.dependencies });
    }
    packages.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    // no manifest / unreadable: packages stays empty (entry.hasVpmManifest says why)
  }
  const legacyAssetsFolders: string[] = [];
  for (const probe of ["UnityMCPPlugin", "VRCSDK", "UdonSharp"]) {
    if (fs.existsSync(path.join(projectPath, "Assets", probe))) legacyAssetsFolders.push(probe);
  }
  return { ...entry, packages, legacyAssetsFolders };
}

// ---- project creation (VCC templates) ---------------------------------------

export function templatesDir(): string {
  const override = process.env.UNITY_MCP_VCC_TEMPLATES;
  if (override && override.length > 0) return override;
  return path.join(path.dirname(vccSettingsPath()), "VRCTemplates");
}

export function listTemplates(dir: string = templatesDir()): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** Case-insensitive template lookup; throws with the available list. */
export function resolveTemplate(name: string, dir: string = templatesDir()): string {
  const all = listTemplates(dir);
  const hit = all.find((t) => t.toLowerCase() === name.toLowerCase());
  if (!hit) {
    throw new Error(
      `template '${name}' not found. Available: ${all.length > 0 ? all.join(", ") : "(none - is VCC installed?)"}`,
    );
  }
  return path.join(dir, hit);
}

export interface CreateProjectResult {
  projectPath: string;
  template: string;
  copiedFiles: number;
}

/**
 * Copies a VCC template to a NEW directory. Refuses to touch an existing
 * one - creation never overwrites.
 */
export function createProject(
  templateName: string,
  projectPath: string,
  dir: string = templatesDir(),
): CreateProjectResult {
  const src = resolveTemplate(templateName, dir);
  if (fs.existsSync(projectPath)) {
    throw new Error(`destination already exists: ${projectPath} (creation never overwrites)`);
  }
  fs.cpSync(src, projectPath, { recursive: true });
  let copied = 0;
  const walk = (p: string): void => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(p, e.name));
      else copied++;
    }
  };
  walk(projectPath);
  return {
    projectPath: projectPath.replaceAll("\\", "/"),
    template: path.basename(src),
    copiedFiles: copied,
  };
}

export interface RegisterResult {
  registered: boolean;
  reason?: string;
}

/**
 * Appends the project to VCC's settings.json userProjects (with a .bak).
 * Best-effort: if VCC is running it may rewrite the file on exit and drop
 * this entry - opening the project from VCC once re-registers it.
 */
export function registerInVcc(
  projectPath: string,
  settingsFile: string = vccSettingsPath(),
): RegisterResult {
  let raw: string;
  try {
    raw = fs.readFileSync(settingsFile, "utf8");
  } catch {
    return { registered: false, reason: "VCC settings.json not found (VCC not installed?)" };
  }
  try {
    const parsed = JSON.parse(raw) as { userProjects?: string[] } & Record<string, unknown>;
    const winPath = projectPath.replaceAll("/", "\\");
    const list = parsed.userProjects ?? [];
    if (list.some((p) => p.toLowerCase() === winPath.toLowerCase())) {
      return { registered: true, reason: "already registered" };
    }
    list.unshift(winPath);
    parsed.userProjects = list;
    fs.copyFileSync(settingsFile, settingsFile + ".bak-unity-mcp");
    fs.writeFileSync(settingsFile, JSON.stringify(parsed, null, 2));
    return { registered: true };
  } catch (err) {
    return { registered: false, reason: `settings.json update failed: ${(err as Error).message}` };
  }
}

// ---- vrc-get ----------------------------------------------------------------

export interface VrcGetResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type VrcGetRunner = (args: string[], timeoutMs: number) => Promise<VrcGetResult>;

export const VRC_GET_INSTALL_HINT =
  "vrc-get not found on PATH. Install it: winget install anatawa12.vrc-get " +
  "(or scoop install vrc-get / cargo install vrc-get), then retry. " +
  "Read-only project inspection (vcc_project) works without it.";

let cachedVrcGet: string | null | undefined;

/** Locate vrc-get on PATH (cached per process). */
export function findVrcGet(): string | null {
  if (cachedVrcGet !== undefined) return cachedVrcGet;
  const exts = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, `vrc-get${ext}`);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        cachedVrcGet = candidate;
        return candidate;
      } catch {
        // keep looking
      }
    }
  }
  cachedVrcGet = null;
  return null;
}

/** For tests. */
export function resetVrcGetCache(): void {
  cachedVrcGet = undefined;
}

export const defaultRunner: VrcGetRunner = (args, timeoutMs) =>
  new Promise((resolve, reject) => {
    const exe = findVrcGet();
    if (exe === null) {
      reject(new Error(VRC_GET_INSTALL_HINT));
      return;
    }
    execFile(
      exe,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          // Non-zero exit lands here with a numeric err.code - that is a
          // normal tool answer, not a transport failure. Timeout kills are
          // identified so the tool layer can answer retryable:true (F-23);
          // other string codes (ENOENT) reject as genuine spawn failures.
          const e = err as NodeJS.ErrnoException & { killed?: boolean };
          if (typeof e.code === "number") {
            resolve({ code: e.code, stdout: String(stdout), stderr: String(stderr) });
          } else if (e.killed === true) {
            reject(new VrcGetTimeoutError(timeoutMs));
          } else {
            reject(err);
          }
          return;
        }
        resolve({ code: 0, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });

/** Timeout kill of a vrc-get invocation (F-23: retryable, unlike a crash). */
export class VrcGetTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`vrc-get timed out after ${timeoutMs} ms and was killed`);
    this.name = "VrcGetTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export interface VpmActionSpec {
  args: string[];
  /** true = stdout is JSON (parse before returning). */
  json: boolean;
  write: boolean;
}

/**
 * Maps a vpm_manage action to a vrc-get invocation. Throws on unknown
 * actions or missing required params - the tool layer converts that to
 * INVALID_PARAMS.
 */
export function vpmActionSpec(
  action: string,
  opts: { project?: string; package?: string; version?: string },
): VpmActionSpec {
  const project = opts.project;
  const needProject = (): string => {
    if (!project) throw new Error(`vpm_manage ${action}: 'project' is required`);
    return project;
  };
  const needPackage = (): string => {
    if (!opts.package) throw new Error(`vpm_manage ${action}: 'package' is required`);
    return opts.package;
  };
  switch (action) {
    case "repos":
      return { args: ["repo", "list"], json: false, write: false };
    case "search":
      return { args: ["search", needPackage()], json: false, write: false };
    case "outdated":
      return {
        args: ["outdated", "--project", needProject(), "--json-format", "1"],
        json: true,
        write: false,
      };
    case "add": {
      const a = ["install", "-y", "--project", needProject(), needPackage()];
      if (opts.version) a.push(opts.version);
      return { args: a, json: false, write: true };
    }
    case "remove":
      return {
        args: ["remove", "-y", "--project", needProject(), needPackage()],
        json: false,
        write: true,
      };
    case "resolve":
      return { args: ["resolve", "--project", needProject()], json: false, write: true };
    case "update_repos":
      return { args: ["update"], json: false, write: true };
    default:
      throw new Error(
        `vpm_manage: unknown action '${action}' ` +
          "(repos|search|outdated|add|remove|resolve|update_repos)",
      );
  }
}
