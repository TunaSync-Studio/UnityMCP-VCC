// Build script:
// 1. bundles src/index.ts into a single self-contained build/index.js with a
//    shebang (the package bin entry),
// 2. writes build/THIRD_PARTY_LICENSES.txt for every npm package the bundle
//    actually contains (the bundle keeps no license comments of its own),
// 3. copies <repo>/recipes -> server/recipes for npm packaging, excluding
//    field/, _quarantine/ and _report.md, and regenerates a filtered
//    _index.json for the copied set.
// Kept as a config file (not an inline npm script) because the banner does
// not survive cmd.exe quoting on Windows.
import { build } from "esbuild";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));

const result = await build({
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
  metafile: true,
});

writeThirdPartyLicenses(result.metafile);
copyRecipes();

// MIT/ISC/BSD all require their notices to travel with redistributed copies;
// derive the list from the bundle's real inputs so it cannot drift.
function writeThirdPartyLicenses(metafile) {
  const pkgDirs = new Set();
  for (const input of Object.keys(metafile.inputs)) {
    const norm = input.split(path.sep).join("/");
    const at = norm.lastIndexOf("node_modules/");
    if (at < 0) continue;
    const parts = norm.slice(at + "node_modules/".length).split("/");
    const name = parts[0]?.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
    if (name) pkgDirs.add(path.resolve(serverDir, norm.slice(0, at), "node_modules", name));
  }
  const sections = [...pkgDirs]
    .map((dir) => {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
      const licenseFile = fs
        .readdirSync(dir)
        .find((f) => /^(licen[sc]e|copying)(\.(md|txt))?$/i.test(f));
      if (licenseFile === undefined) {
        throw new Error(`[build] ${pkg.name} is bundled but ships no LICENSE file`);
      }
      const text = fs.readFileSync(path.join(dir, licenseFile), "utf8").trim();
      return { id: `${pkg.name}@${pkg.version}`, license: String(pkg.license ?? "UNKNOWN"), text };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const out = [
    "Third-party software bundled into build/index.js (generated at build time",
    "from the bundle's inputs; see NOTICE.md).",
    "",
    ...sections.map((s) => `- ${s.id} (${s.license})`),
    "",
    ...sections.flatMap((s) => ["=".repeat(72), `${s.id} - ${s.license}`, "=".repeat(72), "", s.text, ""]),
  ].join("\n");
  fs.writeFileSync(path.join(serverDir, "build", "THIRD_PARTY_LICENSES.txt"), out, "utf8");
  console.error(`[build] third-party notices: ${sections.map((s) => s.id).join(", ")}`);
}

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

  // SMB/NAS directory enumeration can briefly lag behind deletes and return
  // ENOTEMPTY even though every visible child was removed. Node only retries
  // recursive rm when maxRetries is explicit; keep the retry finite.
  fs.rmSync(dstRecipes, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 250,
  });
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
  // The excluded set is configurable and had grown past the names this line
  // used to hardcode, which made a "did everything ship?" audit come out
  // short with no explanation. Report what was actually applied.
  const excludedLabel = [...EXCLUDED_TOP_DIRS].map((d) => `${d}/`).concat([...EXCLUDED_FILES]).join(", ");
  console.error(
    `[build] recipes copied to ${dstRecipes}: ${filtered.length}/${list.length} index entries (excluded: ${excludedLabel})`,
  );
}
