// MCP server assembly: SDK 1.x McpServer on stdio, tools wired from tools.ts,
// recipe resources from resources.ts.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SERVER_VERSION } from "../version.js";
import { registerRecipeResources } from "./resources.js";
import { registerTools, type ToolContext } from "./tools.js";

export const SERVER_NAME = "unity-mcp";
export { SERVER_VERSION };

export function createMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerTools(server, ctx);
  registerRecipeResources(server, ctx.recipes);
  return server;
}

export async function runStdio(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
