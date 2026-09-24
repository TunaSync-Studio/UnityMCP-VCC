// The MCP stdio shutdown sequence begins with the host closing the server's
// stdin. With a live Unity connection the server used to stay alive (the SDK
// stdio transport never reports EOF), keeping its lease refreshed by pings.

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { MockPlugin } from "./mock-plugin.js";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("stdio shutdown", () => {
  let mock: MockPlugin | null = null;
  let tmp = "";

  afterEach(async () => {
    await mock?.stop();
    mock = null;
    if (tmp !== "") fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("exits on stdin EOF even while connected to Unity", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-eof-"));
    mock = new MockPlugin({ registryDir: tmp });
    await mock.start();

    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: serverDir,
      env: { ...process.env, UNITY_MCP_REGISTRY_DIR: tmp, UNITY_MCP_PROJECT: "" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const exited = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));
    try {
      let out = "";
      const gotToolResult = new Promise<void>((resolve) => {
        child.stdout.on("data", (c: Buffer) => {
          out += c.toString("utf8");
          if (out.split("\n").some((l) => l.includes('"id":2'))) resolve();
        });
      });
      const send = (msg: unknown): void => {
        child.stdin.write(`${JSON.stringify(msg)}\n`);
      };
      send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "eof-test", version: "0" },
        },
      });
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "get_editor_state", arguments: {} },
      });
      await gotToolResult;
      expect(mock.liveConnections).toBe(1);

      child.stdin.end();
      const code = await Promise.race([
        exited,
        new Promise<string>((r) => setTimeout(() => r("still running"), 8_000)),
      ]);
      expect(code).toBe(0);
    } finally {
      if (child.exitCode === null) child.kill();
    }
  });
});
