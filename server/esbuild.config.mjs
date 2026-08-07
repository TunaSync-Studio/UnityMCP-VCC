// Build script:
// 1. bundles src/index.ts into a single self-contained build/index.js with a
//    shebang (the package bin entry),
// 2. copies <repo>/recipes -> server/recipes for npm packaging, excluding
//    field/, _quarantine/ and _report.md, and regenerates a filtered
//    _index.json for the copied set.
// Kept as a config file (not an inline npm script) because the banner does
// not survive cmd.exe quoting on Windows.
import { build } from "esbuild";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "build/index.js",
  // No externals: everything except node builtins is bundled into the one file.
  external: [],
  // F-13: stamp the bundle so a running server can prove WHICH build it is
  // (three same-day "tested a stale server" incidents were only caught by
  // comparing process start time against the bundle mtime by hand).
  define: {
    __UNITY_MCP_BUILD_TS__: JSON.stringify(new Date().toISOString()),
  },
  banner: {
    // Shebang first (bin entry), then a require shim for transitive CJS deps.
    js: "#!/usr/bin/env node\nimport { createRequire as __unityMcpCreateRequire } from 'node:module'; const require = __unityMcpCreateRequire(import.meta.url);",
  },
  logLevel: "info",
});

copyRecipes();

function copyRecipes() {
  const srcRecipes = path.resolve(serverDir, "..", "recipes");
  const dstRecipes = path.resolve(serverDir, "recipes");
  const srcIndex = path.join(srcRecipes, "_index.json");

  // Internal working sets and owner-specific world automation are not shipped.
  const EXCLUDED_TOP_DIRS = new Set(
    (process.env.UNITY_MCP_EXCLUDE_RECIPE_DIRS ?? "field,_quarantine")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const EXCLUDED_FILES = new Set(["_report.md"]);

  if (!fs.existsSync(srcIndex)) {
    console.error(`[build] recipes source index not found at ${srcIndex}; skipping recipes copy`);
    return;
  }

  fs.rmSync(dstRecipes, { recursive: true, force: true });
  fs.cpSync(srcRecipes, dstRecipes, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(srcRecipes, src);
      if (rel === "") return true;
      const parts = rel.split(path.sep);
      if (EXCLUDED_TOP_DIRS.has(parts[0])) return false;
      if (EXCLUDED_FILES.has(parts[parts.length - 1])) return false;
      return true;
    },
  });

  // Regenerate the index restricted to entries whose files were copied.
  const rawIndex = JSON.parse(fs.readFileSync(srcIndex, "utf8"));
  const list = Array.isArray(rawIndex) ? rawIndex : [];
  const filtered = list.filter((entry) => {
    const p =
      entry !== null && typeof entry === "object" && typeof entry.path === "string"
        ? entry.path
        : "";
    const top = p.split("/")[0];
    return top !== "" && !EXCLUDED_TOP_DIRS.has(top);
  });
  fs.writeFileSync(path.join(dstRecipes, "_index.json"), JSON.stringify(filtered, null, 2), "utf8");
  console.error(
    `[build] recipes copied to ${dstRecipes}: ${filtered.length}/${list.length} index entries (excluded: field/, _quarantine/, _report.md)`,
  );
}
