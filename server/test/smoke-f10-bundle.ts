// F-10 bundle-level E2E: run the SHIPPED server bundle (build/index.js) over
// real stdio + real TCP against the mock plugin (real bare-array job.status
// shape), and assert the all-jobs listing comes back summarized.
//
// This exists because vitest exercises src/, while F-10 shipped green tests
// with a dead feature: the bundle is the artifact that matters.
//
// Run: npx tsx test/smoke-f10-bundle.ts   (from server/; exit 0 = PASS)

import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { MockPlugin } from "./mock-plugin.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverJs = path.join(here, "..", "build", "index.js");

interface RpcMsg {
  id?: number;
  result?: {
    isError?: boolean;
    content?: Array<{ type: string; text?: string }>;
  };
  error?: unknown;
}

function fail(msg: string): never {
  console.error("FAIL  " + msg);
  process.exit(1);
}

async function main(): Promise<void> {
  if (!fs.existsSync(serverJs)) fail(`bundle missing: ${serverJs} (npm run build first)`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-f10-"));
  const mock = new MockPlugin({ registryDir: tmp });
  await mock.start();

  const child: ChildProcess = spawn(process.execPath, [serverJs], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, UNITY_MCP_REGISTRY_DIR: tmp },
  });

  let buf = "";
  const pending = new Map<number, (m: RpcMsg) => void>();
  let nextId = 1;
  child.stdout?.on("data", (c: Buffer) => {
    buf += c.toString("utf8");
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let msg: RpcMsg;
      try {
        msg = JSON.parse(line) as RpcMsg;
      } catch {
        continue;
      }
      if (msg.id !== undefined && pending.has(msg.id)) {
        const resolve = pending.get(msg.id);
        pending.delete(msg.id);
        resolve?.(msg);
      }
    }
  });

  function rpc(method: string, params: unknown, timeoutMs = 30_000): Promise<RpcMsg> {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        pending.delete(id);
        reject(new Error("rpc timeout " + method));
      }, timeoutMs);
      pending.set(id, (m) => {
        clearTimeout(t);
        resolve(m);
      });
      child.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  function notify(method: string, params: unknown): void {
    child.stdin?.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const r = await rpc("tools/call", { name, arguments: args });
    const text = (r.result?.content ?? [])
      .map((c) => (c.type === "text" ? (c.text ?? "") : ""))
      .join("\n");
    if (r.result?.isError) throw new Error(`${name} isError: ${text.slice(0, 300)}`);
    return text;
  }

  const cleanup = async (): Promise<void> => {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
    await mock.stop();
    fs.rmSync(tmp, { recursive: true, force: true });
  };

  try {
    await rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke-f10", version: "0.0.0" },
    });
    notify("notifications/initialized", {});

    // Create + complete one job through the real wire (dry_run needs no arm).
    await callTool("vrc_upload", { target: "avatar", dry_run: true, timeout_ms: 5_000 });

    const listing = JSON.parse(await callTool("job_status", {})) as Record<string, unknown>;
    if (listing.summarized !== true) {
      fail("job_status {} not summarized - got: " + JSON.stringify(listing).slice(0, 300));
    }
    const jobs = listing.jobs as Array<Record<string, unknown>>;
    if (!Array.isArray(jobs) || jobs.length < 1) fail("no jobs in summarized listing");
    if (jobs.some((j) => j.logs !== undefined || j.result !== undefined)) {
      fail("summarized listing still carries logs/result");
    }
    console.log(
      `PASS  bundle job_status{} summarized:true, jobs=${jobs.length}, ` +
        `keys=${Object.keys(jobs[0] ?? {}).join(",")}`,
    );
  } finally {
    await cleanup();
  }
}

main().catch((err: unknown) => {
  console.error("FAIL  " + String(err));
  process.exit(1);
});
