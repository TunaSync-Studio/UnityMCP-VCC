// Entry point. Builds config, starts the stdio MCP server, and connects to
// Unity lazily on the first tool call - the MCP server must come up even when
// no Unity Editor is running. stdout is the MCP channel; all logging goes to
// stderr (console.error) only.

import { config } from "./config.js";
import { RecipeLibrary } from "./recipes.js";
import { ProjectPool } from "./unity/pool.js";
import { createMcpServer, runStdio, SERVER_VERSION } from "./mcp/server.js";
import { runDoctorCli } from "./doctor.js";

async function main(): Promise<void> {
  if (process.argv[2] === "doctor") {
    process.exitCode = await runDoctorCli(process.argv.slice(3));
    return;
  }

  const pool = new ProjectPool(config);
  const recipes = new RecipeLibrary(config.recipesDir);
  const server = createMcpServer({ pool, cfg: config, recipes });

  function shutdown(code: number): void {
    try {
      pool.disposeAll();
    } catch (err) {
      console.error(`[unity-mcp] dispose failed: ${String(err)}`);
    }
    process.exit(code);
  }

  server.server.onclose = () => {
    console.error("[unity-mcp] transport closed, shutting down");
    shutdown(0);
  };
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  await runStdio(server);
  console.error(
    `[unity-mcp] v${SERVER_VERSION} on stdio ` +
      `(registry: ${config.registryDir}` +
      `${config.projectSelector !== undefined ? `, project: ${config.projectSelector}` : ""})`,
  );
}

main().catch((err: unknown) => {
  console.error(`[unity-mcp] fatal: ${String(err)}`);
  process.exitCode = 1;
});
