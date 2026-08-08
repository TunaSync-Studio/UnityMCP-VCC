import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "../src/config.js";
import { createMcpServer, SERVER_INSTRUCTIONS } from "../src/mcp/server.js";
import { RecipeLibrary } from "../src/recipes.js";
import { ProjectPool } from "../src/unity/pool.js";

const RO = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
const PUBLIC = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };

const EXPECTED_ANNOTATIONS: Record<string, ToolAnnotations> = {
  execute_editor_command: PUBLIC,
  unity_health_check: WRITE,
  get_editor_state: RO,
  scene_query: RO,
  camera_capture: DESTRUCTIVE,
  ndmf_bake_run: WRITE,
  vrc_upload: PUBLIC,
  vrc_avatar_audit: RO,
  find_recipe: RO,
  get_logs: DESTRUCTIVE,
  session_lease: WRITE,
  job_status: RO,
  job_cancel: DESTRUCTIVE,
  vcc_project: RO,
  vpm_manage: DESTRUCTIVE,
};

describe("MCP metadata", () => {
  it("advertises self-contained server instructions and explicit annotations for all tools", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-metadata-"));
    const cfg: Config = { projectSelector: undefined, registryDir: tmp, defaultTimeoutMs: 5000 };
    const pool = new ProjectPool(cfg);
    const recipes = new RecipeLibrary(path.join(tmp, "no-recipes"));
    const server = createMcpServer({ pool, cfg, recipes });
    const client = new Client({ name: "metadata-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      expect(client.getInstructions()).toBe(SERVER_INSTRUCTIONS);
      expect(SERVER_INSTRUCTIONS.split("\n\n", 1)[0]?.length).toBeLessThanOrEqual(512);

      const listed = await client.listTools();
      const actual = Object.fromEntries(listed.tools.map((t) => [t.name, t.annotations]));
      expect(listed.tools).toHaveLength(15);
      expect(actual).toEqual(EXPECTED_ANNOTATIONS);
    } finally {
      await client.close().catch(() => undefined);
      await server.close().catch(() => undefined);
      pool.disposeAll();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
