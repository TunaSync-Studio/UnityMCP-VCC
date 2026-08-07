// MCP resources for the recipe library: each recipe is exposed as
// recipe://<category>/<name>. Listing comes lazily from the index; reading
// loads the markdown file on demand.

import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RecipeLibrary } from "../recipes.js";

function decodeSegment(v: string | string[] | undefined): string {
  const raw = Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function recipeUri(category: string, name: string): string {
  return `recipe://${encodeURIComponent(category)}/${encodeURIComponent(name)}`;
}

export function registerRecipeResources(server: McpServer, recipes: RecipeLibrary): void {
  const template = new ResourceTemplate("recipe://{category}/{name}", {
    list: () => {
      if (!recipes.available) return { resources: [] };
      return {
        resources: recipes.list().map((e) => ({
          uri: recipeUri(e.category, e.name),
          name: e.name,
          description: e.description,
          mimeType: "text/markdown",
        })),
      };
    },
  });

  server.registerResource(
    "unity-recipe",
    template,
    {
      title: "Unity recipes",
      description: "UnityMCP recipe library entries as markdown documents",
      mimeType: "text/markdown",
    },
    (uri, variables) => {
      if (!recipes.available) {
        throw new Error(recipes.unavailableMessage());
      }
      const category = decodeSegment(variables.category);
      const name = decodeSegment(variables.name);
      const entry = recipes.find(category, name);
      if (entry === null) {
        throw new Error(`unknown recipe: ${category}/${name}`);
      }
      return {
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: recipes.readBody(entry) }],
      };
    },
  );
}
