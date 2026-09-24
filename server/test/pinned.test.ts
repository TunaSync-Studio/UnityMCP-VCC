// Pooled clients are pinned to ONE project path. Their reconnect/rediscover
// must match it exactly: substring matching once moved the client for
// `milfy_neo01` onto a still-open `milfy_neo01_jacket` when the first editor
// closed, and every later call for milfy_neo01 then ran in the jacket project.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { resolveProject } from "../src/discovery.js";
import { UnityMcpError } from "../src/errors.js";
import { ProjectPool } from "../src/unity/pool.js";
import { MockPlugin } from "./mock-plugin.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(cond: () => boolean, timeoutMs = 5000, stepMs = 20): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await sleep(stepMs);
  }
}

const A = "C:/Projects/milfy_neo01";
const B = "C:/Projects/milfy_neo01_jacket";

describe("pinned project clients", () => {
  const mocks: MockPlugin[] = [];
  let pool: ProjectPool | null = null;
  let tmp = "";

  afterEach(async () => {
    pool?.disposeAll();
    pool = null;
    for (const m of mocks.splice(0)) await m.stop();
    if (tmp !== "") fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("exact resolution never falls back to a prefix sibling", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-pin-"));
    const cfg: Config = { projectSelector: undefined, registryDir: tmp, defaultTimeoutMs: 5000 };
    const b = new MockPlugin({ registryDir: tmp, projectPath: B, projectName: "milfy_neo01_jacket" });
    mocks.push(b);
    await b.start();
    // User-facing selectors keep substring matching...
    expect(resolveProject(cfg, A).projectPath).toBe(B);
    // ...a pinned path does not.
    expect(() => resolveProject(cfg, A, { exact: true })).toThrowError(UnityMcpError);
    expect(resolveProject(cfg, B, { exact: true }).projectPath).toBe(B);
  });

  it("a client pinned to A never reconnects to B after A's editor closes", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-pin-"));
    const cfg: Config = { projectSelector: undefined, registryDir: tmp, defaultTimeoutMs: 5000 };
    const a = new MockPlugin({ registryDir: tmp, projectPath: A, projectName: "milfy_neo01" });
    const b = new MockPlugin({ registryDir: tmp, projectPath: B, projectName: "milfy_neo01_jacket" });
    mocks.push(a, b);
    await a.start();
    await b.start();
    pool = new ProjectPool(cfg, {
      backoffMs: [20, 40],
      graceCloseMs: 300,
      rediscoverMs: 50,
      heartbeatMs: 0,
    });

    const { client } = pool.resolve(A);
    await client.call("sys.echo", { warm: 1 });
    expect(a.received.hellos).toHaveLength(1);

    // A's editor crashes/quits without bye; B stays open.
    await a.stop();
    await waitFor(() => client.getState() === "failed");
    // Let the rediscover timer tick a few times: it must not adopt B.
    await sleep(300);
    expect(b.received.hellos).toHaveLength(0);

    // A comes back (same path, new editor session): calls for A land in A.
    const a2 = new MockPlugin({ registryDir: tmp, projectPath: A, projectName: "milfy_neo01" });
    mocks.push(a2);
    await a2.start();
    const again = pool.resolve(A);
    await again.client.call("sys.echo", { forA: true }, { timeoutMs: 5000 });
    expect(a2.received.reqs.some((r) => r.method === "sys.echo")).toBe(true);
    expect(b.received.reqs).toHaveLength(0);
  });
});
