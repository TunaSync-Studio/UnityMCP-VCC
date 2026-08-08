import { describe, expect, it } from "vitest";
import { buildDoctorReport, type DoctorDeps } from "../src/doctor.js";
import type { Config } from "../src/config.js";
import type { DiscoveredProject } from "../src/discovery.js";

const cfg: Config = {
  projectSelector: undefined,
  registryDir: "C:/private/registry",
  defaultTimeoutMs: 60_000,
};

function deps(overrides: Partial<DoctorDeps> = {}): DoctorDeps {
  return {
    cfg,
    nodeVersion: "v22.0.0",
    recipes: {
      available: true,
      count: 412,
      baseDir: "C:/private/recipes",
      unavailableMessage: () => "private path",
    },
    scan: () => [],
    probeHealth: async () => ({ status: "ok", pluginVersion: "2.5.0" }),
    vccProjects: { settingsPath: "C:/private/settings.json", projects: [] },
    vrcGetPath: null,
    now: () => new Date("2026-08-09T00:00:00.000Z"),
    ...overrides,
  };
}

function liveProject(): DiscoveredProject {
  return {
    file: "C:/private/registry/abc.json",
    mtimeMs: Date.now(),
    alive: true,
    entry: {
      schemaVersion: 1,
      protocolV: 1,
      port: 47700,
      projectPath: "C:/private/MyAvatar",
      projectName: "MyAvatar",
      pid: 123,
      unityVersion: "2022.3.22f1",
      pluginVersion: "2.5.0",
      startedAt: "2026-08-09T00:00:00Z",
      token: "must-not-leak",
    },
  };
}

describe("doctor", () => {
  it("treats missing optional Unity, VCC and vrc-get as warnings", async () => {
    const report = await buildDoctorReport(deps());
    expect(report.ok).toBe(true);
    expect(report.summary.fail).toBe(0);
    expect(report.checks.find((check) => check.id === "unity")?.status).toBe("warn");
  });

  it("fails an unsupported Node runtime", async () => {
    const report = await buildDoctorReport(deps({ nodeVersion: "v18.20.0" }));
    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.id === "node")?.status).toBe("fail");
  });

  it("probes live Unity and omits token and paths by default", async () => {
    const project = liveProject();
    const report = await buildDoctorReport(deps({ scan: () => [project] }));
    expect(report.ok).toBe(true);
    const json = JSON.stringify(report);
    expect(json).not.toContain("MyAvatar");
    expect(json).not.toContain("must-not-leak");
    expect(json).not.toContain("C:/private/MyAvatar");
    expect(json).not.toContain("C:/private/registry");
  });

  it("fails when a live registry entry does not answer health", async () => {
    const report = await buildDoctorReport(
      deps({
        scan: () => [liveProject()],
        probeHealth: async () => {
          throw new Error("connection refused");
        },
      }),
    );
    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.id === "unity")?.status).toBe("fail");
  });

  it("includes absolute paths only in verbose mode", async () => {
    const report = await buildDoctorReport(
      deps({ scan: () => [liveProject()] }),
      { verbose: true },
    );
    expect(JSON.stringify(report)).toContain("C:/private/MyAvatar");
    expect(JSON.stringify(report)).not.toContain("must-not-leak");
  });
});
