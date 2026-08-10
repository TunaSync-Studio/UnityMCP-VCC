// F-5 (2.6.3): the F-12 "unresponsive" BUSY_MODAL must gain the blocked
// editor's own modal answer when a live probe can reach the transport thread.
// The probe itself is TCP (covered live); this exercises the gate + merge.
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { enrichBusyModal } from "../src/unity/blockedProbe.js";
import type { Config } from "../src/config.js";
import type { ErrorObj } from "../src/protocol.js";

const PLUGIN_ANSWER: ErrorObj = {
  code: "BUSY_MODAL",
  message:
    'editor main thread unresponsive for 193000 ms\n  modal: "UnlitWF Shader"  buttons: [OK]  kind: decision',
  retryable: true,
  detail: {
    pid: 4242,
    projectPath: "C:/proj/a",
    lastTickAgoMs: 193_000,
    modal: { title: "UnlitWF Shader", buttons: ["OK"], kind: "decision" },
    modalCount: 1,
  },
};

function f12Error(pid: number): ErrorObj {
  return {
    code: "BUSY_MODAL",
    message: "running but unresponsive: registry heartbeat stalled",
    retryable: true,
    detail: {
      candidates: [{ pid, projectPath: "C:/proj/a", port: 47_777 }],
      heartbeatAgeMs: 193_000,
    },
  };
}

function tmpRegistry(pid: number): { cfg: Config; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-probe-"));
  fs.writeFileSync(
    path.join(dir, "entry.json"),
    JSON.stringify({
      schemaVersion: 1,
      port: 47_777,
      projectPath: "C:/proj/a",
      projectName: "a",
      pid,
      unityVersion: "2022.3.22f1",
      token: "tok",
    }),
  );
  return { cfg: { registryDir: dir } as unknown as Config, dir };
}

describe("enrichBusyModal (F-5)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length > 0) {
      const d = dirs.pop();
      if (d) fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it("grafts the probed modal answer onto the F-12 error, keeping candidates", async () => {
    const { cfg, dir } = tmpRegistry(process.pid);
    dirs.push(dir);
    const probe = vi.fn().mockResolvedValue(PLUGIN_ANSWER);
    const out = await enrichBusyModal(cfg, f12Error(process.pid), probe);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(out.message).toContain("UnlitWF Shader");
    const detail = out.detail as Record<string, unknown>;
    expect(detail.modal).toEqual(PLUGIN_ANSWER.detail && (PLUGIN_ANSWER.detail as never)["modal"]);
    expect(detail.modalCount).toBe(1);
    expect(detail.heartbeatAgeMs).toBe(193_000);
    expect(Array.isArray(detail.candidates)).toBe(true);
    expect(detail.probedLive).toBe(true);
  });

  it("returns the original error untouched when the probe yields nothing", async () => {
    const { cfg, dir } = tmpRegistry(process.pid);
    dirs.push(dir);
    const original = f12Error(process.pid);
    const out = await enrichBusyModal(cfg, original, vi.fn().mockResolvedValue(null));
    expect(out).toBe(original);
  });

  it("does not probe non-F-12 errors", async () => {
    const probe = vi.fn();
    const { cfg, dir } = tmpRegistry(process.pid);
    dirs.push(dir);
    const plain: ErrorObj = { code: "TIMEOUT", message: "x", retryable: true };
    expect(await enrichBusyModal(cfg, plain, probe)).toBe(plain);
    const alreadyProbed: ErrorObj = {
      code: "BUSY_MODAL",
      message: "x",
      retryable: true,
      detail: { heartbeatAgeMs: 1, modal: null, candidates: [{ pid: process.pid }] },
    };
    expect(await enrichBusyModal(cfg, alreadyProbed, probe)).toBe(alreadyProbed);
    expect(await enrichBusyModal(null, f12Error(process.pid), probe)).toEqual(
      f12Error(process.pid),
    );
    expect(probe).not.toHaveBeenCalled();
  });

  it("skips when the pid has no registry entry (no token to authenticate)", async () => {
    const { cfg, dir } = tmpRegistry(999_999_991);
    dirs.push(dir);
    const probe = vi.fn();
    const original = f12Error(123_456);
    expect(await enrichBusyModal(cfg, original, probe)).toBe(original);
    expect(probe).not.toHaveBeenCalled();
  });
});
