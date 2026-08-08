// Read-only local diagnostics. This module never creates, edits, registers or
// deletes a Unity/VCC project and never prints registry authentication tokens.
import { config, type Config } from "./config.js";
import { scanRegistry, type DiscoveredProject } from "./discovery.js";
import { RecipeLibrary } from "./recipes.js";
import { SERVER_BUILD_TS, SERVER_VERSION } from "./version.js";
import { findVrcGet, listProjects } from "./vcc.js";

export type DoctorStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  id: string;
  status: DoctorStatus;
  message: string;
  detail?: unknown;
}

export interface DoctorReport {
  ok: boolean;
  version: string;
  build: string;
  generatedAt: string;
  checks: DoctorCheck[];
  summary: { pass: number; warn: number; fail: number };
}

export interface DoctorOptions {
  verbose?: boolean;
}

export interface DoctorDeps {
  cfg: Config;
  nodeVersion: string;
  recipes: Pick<RecipeLibrary, "available" | "count" | "baseDir" | "unavailableMessage">;
  scan: (cfg: Config) => DiscoveredProject[];
  probeHealth: (port: number) => Promise<unknown>;
  vccProjects: ReturnType<typeof listProjects>;
  vrcGetPath: string | null;
  now: () => Date;
}

function majorOf(version: string): number {
  const major = Number(version.replace(/^v/, "").split(".")[0]);
  return Number.isFinite(major) ? major : 0;
}

export async function buildDoctorReport(
  deps: DoctorDeps,
  options: DoctorOptions = {},
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const verbose = options.verbose === true;

  const nodeMajor = majorOf(deps.nodeVersion);
  checks.push({
    id: "node",
    status: nodeMajor >= 20 ? "pass" : "fail",
    message:
      nodeMajor >= 20
        ? `Node ${deps.nodeVersion} satisfies the >=20 requirement.`
        : `Node ${deps.nodeVersion} is unsupported; install Node 20 or newer.`,
  });

  checks.push({
    id: "server",
    status: "pass",
    message: `tunasync-unity-mcp v${SERVER_VERSION} (${SERVER_BUILD_TS}).`,
  });

  if (deps.recipes.available && deps.recipes.count > 0) {
    checks.push({
      id: "recipes",
      status: "pass",
      message: `${deps.recipes.count} public recipes are available.`,
      ...(verbose ? { detail: { directory: deps.recipes.baseDir } } : {}),
    });
  } else {
    checks.push({
      id: "recipes",
      status: "fail",
      message: verbose
        ? deps.recipes.unavailableMessage()
        : "The bundled public recipe library is missing or unreadable.",
    });
  }

  const discovered = deps.scan(deps.cfg);
  const live = discovered.filter((project) => project.alive);
  const stale = discovered.filter((project) => !project.alive);
  if (discovered.length === 0) {
    checks.push({
      id: "unity",
      status: "warn",
      message: "No Unity MCP registry entry was found. Open an enabled Unity project to use editor tools.",
      ...(verbose ? { detail: { registryDirectory: deps.cfg.registryDir } } : {}),
    });
  } else {
    const probes = await Promise.all(
      live.map(async (project) => {
        try {
          const health = (await deps.probeHealth(project.entry.port)) as Record<string, unknown>;
          return {
            pid: project.entry.pid,
            unityVersion: project.entry.unityVersion,
            pluginVersion:
              typeof health.pluginVersion === "string"
                ? health.pluginVersion
                : project.entry.pluginVersion,
            responsive: health.status === "ok",
            ...(verbose
              ? { name: project.entry.projectName, projectPath: project.entry.projectPath }
              : {}),
          };
        } catch (error) {
          return {
            pid: project.entry.pid,
            unityVersion: project.entry.unityVersion,
            pluginVersion: project.entry.pluginVersion,
            responsive: false,
            error: error instanceof Error ? error.message : String(error),
            ...(verbose
              ? { name: project.entry.projectName, projectPath: project.entry.projectPath }
              : {}),
          };
        }
      }),
    );
    const broken = probes.filter((probe) => !probe.responsive);
    const staleDetail = stale.map((project) => ({
      pid: project.entry.pid,
      reason: project.reason,
      ...(verbose
        ? { name: project.entry.projectName, projectPath: project.entry.projectPath }
        : {}),
    }));
    const fail = broken.length > 0 || stale.some((project) => project.reason === "unresponsive");
    checks.push({
      id: "unity",
      status: fail ? "fail" : live.length > 0 ? "pass" : "warn",
      message: fail
        ? "A registered Unity editor is unresponsive or its health endpoint failed."
        : live.length > 0
          ? `${live.length} Unity editor${live.length === 1 ? " is" : "s are"} responsive.`
          : "Registry entries exist, but no connectable Unity editor is currently available.",
      detail: { live: probes, stale: staleDetail },
    });
  }

  const vcc = deps.vccProjects.projects;
  const existing = vcc.filter((project) => project.exists);
  checks.push({
    id: "vcc",
    status: vcc.length > 0 ? "pass" : "warn",
    message:
      vcc.length > 0
        ? `VCC knows ${vcc.length} project${vcc.length === 1 ? "" : "s"}; ${existing.length} exist on disk.`
        : "No VCC projects were found. Editor MCP tools still work without VCC.",
    detail: verbose
      ? {
          projects: vcc.map((project) => ({
            name: project.name,
            exists: project.exists,
            unityVersion: project.unityVersion,
            hasVpmManifest: project.hasVpmManifest,
            path: project.path,
          })),
          settingsPath: deps.vccProjects.settingsPath,
        }
      : {
          known: vcc.length,
          existing: existing.length,
          withVpmManifest: vcc.filter((project) => project.hasVpmManifest).length,
        },
  });

  checks.push({
    id: "vrc-get",
    status: deps.vrcGetPath !== null ? "pass" : "warn",
    message:
      deps.vrcGetPath !== null
        ? "vrc-get is available for VPM write operations."
        : "vrc-get is not on PATH; read-only VCC inspection still works.",
    ...(verbose && deps.vrcGetPath !== null ? { detail: { executable: deps.vrcGetPath } } : {}),
  });

  const summary = { pass: 0, warn: 0, fail: 0 };
  for (const check of checks) summary[check.status]++;
  return {
    ok: summary.fail === 0,
    version: SERVER_VERSION,
    build: SERVER_BUILD_TS,
    generatedAt: deps.now().toISOString(),
    checks,
    summary,
  };
}

export async function probeUnityHealth(port: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function runDoctorCli(args: string[]): Promise<number> {
  const json = args.includes("--json");
  const verbose = args.includes("--verbose");
  const report = await buildDoctorReport(
    {
      cfg: config,
      nodeVersion: process.version,
      recipes: new RecipeLibrary(config.recipesDir),
      scan: scanRegistry,
      probeHealth: probeUnityHealth,
      vccProjects: listProjects(),
      vrcGetPath: findVrcGet(),
      now: () => new Date(),
    },
    { verbose },
  );

  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(`TunaSync Unity MCP doctor v${report.version}\n`);
    for (const check of report.checks) {
      const marker = check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : "FAIL";
      process.stdout.write(`[${marker}] ${check.id}: ${check.message}\n`);
      if (check.detail !== undefined && (verbose || check.id === "unity" || check.id === "vcc")) {
        process.stdout.write(JSON.stringify(check.detail, null, 2) + "\n");
      }
    }
    process.stdout.write(
      `Result: ${report.ok ? "ready" : "needs attention"} ` +
        `(${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.fail} fail)\n`,
    );
  }
  return report.ok ? 0 : 1;
}
