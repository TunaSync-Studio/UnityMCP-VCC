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
import { execFile, spawn, spawnSync } from "node:child_process";
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
    return m?.[1] ?? null;
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
  try {
    const parsed = JSON.parse(raw) as { userProjects?: string[] };
    const projects = (parsed.userProjects ?? []).map(entryFor);
    return { settingsPath: settingsFile, projects };
  } catch {
    // VCC can briefly expose a partial file while rewriting settings.json.
    // Reads stay non-fatal and, critically, never overwrite that file.
    return { settingsPath: settingsFile, projects: [] };
  }
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
    case "upgrade": {
      // P1-1. No package = upgrade everything in the project. `-y` also
      // waives vrc-get's conflict confirmation, so the caller MUST surface
      // stdout/stderr verbatim - a liltoon-style conflict warning sailing
      // through silently is exactly the failure mode this note guards.
      const a = ["upgrade", "--project", needProject()];
      if (opts.package) {
        a.push(opts.package);
        if (opts.version) a.push(opts.version);
      }
      a.push("-y");
      return { args: a, json: false, write: true };
    }
    default:
      throw new Error(
        `vpm_manage: unknown action '${action}' ` +
          "(repos|search|outdated|add|remove|resolve|upgrade|update_repos)",
      );
  }
}

// ---- P1-2: derived-cache hygiene after package writes ----------------------

function registryDir(): string {
  const override = process.env.UNITY_MCP_REGISTRY_DIR;
  if (override && override.length > 0) return override;
  const localAppData =
    process.env.LOCALAPPDATA && process.env.LOCALAPPDATA.length > 0
      ? process.env.LOCALAPPDATA
      : path.join(os.homedir(), "AppData", "Local");
  return path.join(localAppData, "UnityMCP", "registry");
}

function samePath(a: string, b: string): boolean {
  const norm = (p: string): string => p.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

/**
 * Unity's own per-project lock: `<project>/Temp/UnityLockfile` exists while an
 * editor has the project open - independent of whether our plugin compiled.
 * Can be left behind by a hard crash (stale lockfile), which errs in the safe
 * direction for every caller (refuse to clean / refuse to double-launch).
 */
export function unityLockfilePresent(projectPath: string): boolean {
  try {
    return fs.existsSync(path.join(projectPath, "Temp", "UnityLockfile"));
  } catch {
    return false;
  }
}

/**
 * OS-level fallback: pid of a running Unity editor whose command line contains
 * this project path. Covers editors the registry cannot see - Safe Mode or a
 * failed plugin compile, exactly the states quit/cleanup exist for.
 */
export function findUnityPidByProject(projectPath: string): number | undefined {
  const want = projectPath.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
  try {
    if (process.platform === "win32") {
      const r = spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Get-CimInstance Win32_Process -Filter \"Name='Unity.exe'\" | " +
            'ForEach-Object { "$($_.ProcessId)`t$($_.CommandLine)" }',
        ],
        { encoding: "utf8", timeout: 15_000, windowsHide: true },
      );
      if (r.status !== 0 || !r.stdout) return undefined;
      for (const line of r.stdout.split(/\r?\n/)) {
        const tab = line.indexOf("\t");
        if (tab <= 0) continue;
        const pid = Number.parseInt(line.slice(0, tab).trim(), 10);
        const cmd = line.slice(tab + 1).replaceAll("\\", "/").toLowerCase();
        if (Number.isFinite(pid) && pid > 0 && cmd.includes(want)) return pid;
      }
      return undefined;
    }
    const r = spawnSync("ps", ["-axo", "pid=,command="], { encoding: "utf8", timeout: 15_000 });
    if (r.status !== 0 || !r.stdout) return undefined;
    for (const line of r.stdout.split("\n")) {
      const m = /^\s*(\d+)\s+(.*)$/.exec(line);
      const pidText = m?.[1];
      const cmdText = m?.[2];
      if (pidText === undefined || cmdText === undefined) continue;
      const cmd = cmdText.replaceAll("\\", "/").toLowerCase();
      if (cmd.includes("unity") && cmd.includes(want)) return Number.parseInt(pidText, 10);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Is a Unity editor open on this project? Two-stage (F-1):
 *   1. discovery registry with pid liveness - gives the pid, but only sees
 *      editors where the plugin loaded;
 *   2. Temp/UnityLockfile - Unity's own truth, catches Safe-Mode/compile-fail
 *      editors the registry misses (the state that once let clean_library
 *      delete Library/Bee under a live editor).
 * Deleting Library folders under a running editor is how projects get
 * corrupted, so the cleaner refuses while this returns open:true.
 */
export function editorOpenOn(projectPath: string): {
  open: boolean;
  pid?: number;
  source?: "registry" | "lockfile";
} {
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(registryDir());
  } catch {
    // no registry dir yet - fall through to the lockfile check
  }
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(registryDir(), name), "utf8")) as {
        projectPath?: string;
        pid?: number;
      };
      if (!parsed.projectPath || typeof parsed.pid !== "number") continue;
      if (!samePath(parsed.projectPath, projectPath)) continue;
      try {
        process.kill(parsed.pid, 0);
        return { open: true, pid: parsed.pid, source: "registry" };
      } catch {
        // dead pid: stale entry, not an open editor
      }
    } catch {
      // unreadable/corrupt entry - resilience over strictness (2.5.0 rule)
    }
  }
  if (unityLockfilePresent(projectPath)) {
    return { open: true, source: "lockfile" };
  }
  return { open: false };
}

// ---- P1-3: Unity editor lifecycle (editorless layer) -----------------------

export interface EditorRegistryEntry {
  projectPath: string;
  projectName?: string;
  pid: number;
  port?: number;
  alive: boolean;
}

/** Discovery-registry entries with pid liveness resolved (stale entries kept, flagged dead). */
export function readEditorRegistry(): EditorRegistryEntry[] {
  let names: string[];
  try {
    names = fs.readdirSync(registryDir());
  } catch {
    return [];
  }
  const out: EditorRegistryEntry[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(registryDir(), name), "utf8")) as {
        projectPath?: string;
        projectName?: string;
        pid?: number;
        port?: number;
      };
      if (!parsed.projectPath || typeof parsed.pid !== "number") continue;
      let alive = false;
      try {
        process.kill(parsed.pid, 0);
        alive = true;
      } catch {
        alive = false;
      }
      out.push({
        projectPath: parsed.projectPath,
        projectName: parsed.projectName,
        pid: parsed.pid,
        port: typeof parsed.port === "number" ? parsed.port : undefined,
        alive,
      });
    } catch {
      // corrupt entry: skip (resilience over strictness)
    }
  }
  return out;
}

/** m_EditorVersion from ProjectSettings/ProjectVersion.txt, or null. */
export function projectEditorVersion(projectPath: string): string | null {
  try {
    const t = fs.readFileSync(
      path.join(projectPath, "ProjectSettings", "ProjectVersion.txt"),
      "utf8",
    );
    return /m_EditorVersion:\s*(\S+)/.exec(t)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Locate the Unity.exe for a project: explicit editor_path > VCC
 * settings.json unityEditors matching the project's m_EditorVersion >
 * the Unity Hub conventional install path for that version.
 */
export function resolveUnityExe(
  projectPath: string,
  explicit?: string,
): { exe: string | null; source: string; version: string | null } {
  const version = projectEditorVersion(projectPath);
  if (explicit) {
    return { exe: fs.existsSync(explicit) ? explicit : null, source: "editor_path", version };
  }
  try {
    const settings = JSON.parse(fs.readFileSync(vccSettingsPath(), "utf8")) as {
      unityEditors?: unknown;
      pathToUnityExe?: unknown;
    };
    const editors = Array.isArray(settings.unityEditors) ? settings.unityEditors : [];
    for (const entry of editors) {
      const p =
        typeof entry === "string"
          ? entry
          : typeof (entry as { path?: unknown }).path === "string"
            ? (entry as { path: string }).path
            : null;
      if (!p || !fs.existsSync(p)) continue;
      if (version === null || p.includes(version)) {
        return { exe: p, source: "vcc.unityEditors", version };
      }
    }
    if (
      typeof settings.pathToUnityExe === "string" &&
      settings.pathToUnityExe.length > 0 &&
      fs.existsSync(settings.pathToUnityExe) &&
      (version === null || settings.pathToUnityExe.includes(version))
    ) {
      return { exe: settings.pathToUnityExe, source: "vcc.pathToUnityExe", version };
    }
  } catch {
    // no readable VCC settings: fall through to the Hub convention
  }
  if (version !== null) {
    const programFiles = process.env.ProgramFiles ?? "C:/Program Files";
    const hub = path.join(programFiles, "Unity", "Hub", "Editor", version, "Editor", "Unity.exe");
    if (fs.existsSync(hub)) return { exe: hub, source: "hub", version };
  }
  return { exe: null, source: "none", version };
}

/**
 * Spawn a detached editor with -projectPath (argv array keeps spaced paths
 * intact). Deliberately NEVER -openfile: it left Unity at 0 s CPU and
 * unresponsive for 18 minutes in the 2026-08-09 field session - open scenes
 * after startup via EditorSceneManager instead.
 */
export function launchUnity(projectPath: string, exe: string): { pid: number } {
  const child = spawn(exe, ["-projectPath", projectPath], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  if (typeof child.pid !== "number") throw new Error("Unity spawn returned no pid");
  return { pid: child.pid };
}

/** Graceful close first: taskkill without /F posts WM_CLOSE. */
export function closeProcessGracefully(pid: number): { requested: boolean; detail: string } {
  const r = spawnSync("taskkill", ["/PID", String(pid)], { encoding: "utf8" });
  return { requested: r.status === 0, detail: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

/** Forced kill - can corrupt Library; only after a graceful attempt. */
export function killProcess(pid: number): { requested: boolean; detail: string } {
  const r = spawnSync("taskkill", ["/PID", String(pid), "/F"], { encoding: "utf8" });
  return { requested: r.status === 0, detail: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete DERIVED editor caches after a package write. Scope is deliberately
 * narrow: Library/Bee and Library/ScriptAssemblies - the two that leave the
 * next start in Safe Mode ("Unable to resolve reference 'UniTask'") when
 * stale. Library/PackageCache and Library/ArtifactDB re-import for tens of
 * minutes and are never touched.
 */
export function cleanDerivedLibrary(projectPath: string): { cleaned: string[]; absent: string[] } {
  const cleaned: string[] = [];
  const absent: string[] = [];
  for (const name of ["Bee", "ScriptAssemblies"]) {
    const target = path.join(projectPath, "Library", name);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
      cleaned.push(`Library/${name}`);
    } else {
      absent.push(`Library/${name}`);
    }
  }
  return { cleaned, absent };
}
