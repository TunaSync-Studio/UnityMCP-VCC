// F-5/F-8 (2.6.4): the F-12 "unresponsive" BUSY_MODAL must gain the blocked
// editor's own modal answer. F-8 lesson: the first version of this suite
// mocked the probe function and only verified the graft - the acquisition
// path (sys.status fast path answering BEFORE the watchdog) was never
// exercised and the fix never fired in the field. These tests therefore run
// the REAL probeBlockedEditor over real TCP against the scriptable mock
// plugin; only the pure gate logic keeps non-TCP cases.
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { enrichBusyModal, probeBlockedEditor } from "../src/unity/blockedProbe.js";
import { MockPlugin, MockPluginError, RESPOND_METHOD_NOT_FOUND } from "./mock-plugin.js";
import type { Config } from "../src/config.js";
import type { ErrorObj } from "../src/protocol.js";

const MODAL = { title: "UnlitWF Shader", buttons: ["OK", "Cancel"], kind: "decision" };

function f12Error(pid: number): ErrorObj {
  return {
    code: "BUSY_MODAL",
    message: "running but unresponsive: registry heartbeat stalled",
    retryable: true,
    detail: {
      candidates: [{ pid, projectPath: "C:/Test/MockProject", port: 47_777 }],
      heartbeatAgeMs: 193_000,
    },
  };
}

describe("blocked-editor probe over real TCP (F-8)", () => {
  const cleanups: Array<() => Promise<void> | void> = [];
  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()?.();
  });

  async function startMock(handlers: Record<string, unknown>): Promise<{
    mock: MockPlugin;
    cfg: Config;
  }> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-probe-"));
    const mock = new MockPlugin({
      registryDir: dir,
      requireToken: "tok",
      handlers: handlers as never,
    });
    await mock.start();
    cleanups.push(async () => {
      await mock.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    return { mock, cfg: { registryDir: dir } as unknown as Config };
  }

  it("gets the modal from a 2.6.4 plugin's sys.modal fast path", async () => {
    const { mock, cfg } = await startMock({
      "sys.modal": () => ({ pid: process.pid, lastTickAgoMs: 200_000, modal: MODAL, modalCount: 1 }),
    });
    const out = await enrichBusyModal(cfg, f12Error(process.pid));
    expect(out.message).toContain("UnlitWF Shader");
    expect(out.message).toContain("A human must dismiss");
    const detail = out.detail as Record<string, unknown>;
    expect(detail.modal).toEqual(MODAL);
    expect(detail.modalCount).toBe(1);
    expect(detail.lastTickAgoMs).toBe(200_000);
    expect(detail.heartbeatAgeMs).toBe(193_000);
    expect(detail.probedLive).toBe(true);
    expect(mock.received.reqs.map((r) => r.method)).toEqual(["sys.modal"]);
  });

  it("falls back to sys.echo -> watchdog BUSY_MODAL on a pre-2.6.4 plugin", async () => {
    const { mock, cfg } = await startMock({
      "sys.modal": () => RESPOND_METHOD_NOT_FOUND,
      "sys.echo": () => {
        throw new MockPluginError("BUSY_MODAL", "editor main thread unresponsive for 200000 ms", true, {
          pid: process.pid,
          lastTickAgoMs: 200_000,
          modal: MODAL,
          modalCount: 1,
        });
      },
    });
    const out = await enrichBusyModal(cfg, f12Error(process.pid));
    const detail = out.detail as Record<string, unknown>;
    expect(detail.modal).toEqual(MODAL);
    expect(detail.probedLive).toBe(true);
    expect(mock.received.reqs.map((r) => r.method)).toEqual(["sys.modal", "sys.echo"]);
  });

  it("reports 'no dialog' when the blocked editor has none (still useful)", async () => {
    const { cfg } = await startMock({
      "sys.modal": () => ({ pid: process.pid, lastTickAgoMs: 180_000, modal: null, modalCount: 0 }),
    });
    const out = await enrichBusyModal(cfg, f12Error(process.pid));
    expect(out.message).toContain("no native dialog is up");
    const detail = out.detail as Record<string, unknown>;
    expect(detail.modalCount).toBe(0);
    expect(detail.probedLive).toBe(true);
  });

  it("leaves the error untouched when the editor answers echo ok (unblocked)", async () => {
    const { cfg } = await startMock({
      "sys.modal": () => RESPOND_METHOD_NOT_FOUND,
      // builtin sys.echo answers ok - editor not blocked after all
    });
    const original = f12Error(process.pid);
    const out = await enrichBusyModal(cfg, original);
    expect(out).toBe(original);
  });

  it("probeBlockedEditor resolves null against a dead port (no lingering)", async () => {
    const answer = await probeBlockedEditor(
      {
        schemaVersion: 1,
        port: 1,
        projectPath: "C:/x",
        projectName: "x",
        pid: 1,
        unityVersion: "2022.3.22f1",
      } as never,
      1_500,
    );
    expect(answer).toBeNull();
  });
});

describe("enrich gate (pure)", () => {
  it("does not probe non-F-12 errors", async () => {
    const probe = vi.fn();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-gate-"));
    try {
      const cfg = { registryDir: tmp } as unknown as Config;
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
      const noEntry = f12Error(123_456);
      expect(await enrichBusyModal(cfg, noEntry, probe)).toBe(noEntry);
      expect(probe).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
