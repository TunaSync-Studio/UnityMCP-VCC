// Server-local recipe library: lazy-loads recipes/_index.json, scores keyword
// searches, and serves full markdown bodies. No Unity connection involved.
//
// Directory resolution order:
//   1. explicit dir (env UNITY_MCP_RECIPES_DIR via config.recipesDir)
//   2. <bundleDir>/../recipes    (mirror layout: build/../recipes)
//   3. <bundleDir>/../../recipes (repo layout:   server/build/../../recipes)
// where bundleDir is the directory of the executing script.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const RECIPE_INDEX_FILE = "_index.json";

export interface RecipeEntry {
  name: string;
  category: string;
  tags: string[];
  description: string;
  kind?: string;
  sync?: string;
  requires?: string[];
  qa?: string;
  path: string;
  sha1?: string;
}

export interface RecipeHit {
  entry: RecipeEntry;
  score: number;
}

export interface RecipeSearchOptions {
  /** Entries must carry every one of these tags (case-insensitive). */
  tags?: string[];
  topN?: number;
}

export interface RecipeSearchResult {
  /** True when the query was an exact (case-insensitive) name match. */
  exact: boolean;
  /** Number of entries with a positive score (or 1 for an exact hit). */
  totalMatches: number;
  hits: RecipeHit[];
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}

function toEntry(x: unknown): RecipeEntry | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  if (typeof o.name !== "string" || typeof o.category !== "string" || typeof o.path !== "string") {
    return null;
  }
  return {
    name: o.name,
    category: o.category,
    tags: isStringArray(o.tags) ? o.tags : [],
    description: typeof o.description === "string" ? o.description : "",
    ...(typeof o.kind === "string" ? { kind: o.kind } : {}),
    ...(typeof o.sync === "string" ? { sync: o.sync } : {}),
    ...(isStringArray(o.requires) ? { requires: o.requires } : {}),
    ...(typeof o.qa === "string" ? { qa: o.qa } : {}),
    path: o.path,
    ...(typeof o.sha1 === "string" ? { sha1: o.sha1 } : {}),
  };
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export class RecipeLibrary {
  private loadAttempted = false;
  private dir: string | null = null;
  private entries: RecipeEntry[] = [];
  private loadError: string | null = null;

  constructor(private readonly explicitDir?: string) {}

  private candidateDirs(): string[] {
    if (this.explicitDir !== undefined) return [this.explicitDir];
    const bundleDir = path.dirname(fileURLToPath(import.meta.url));
    return [
      path.resolve(bundleDir, "..", "recipes"),
      path.resolve(bundleDir, "..", "..", "recipes"),
    ];
  }

  /** Lazy: first call probes candidate dirs and caches the parsed index. */
  private ensureLoaded(): void {
    if (this.loadAttempted) return;
    this.loadAttempted = true;
    for (const cand of this.candidateDirs()) {
      const indexFile = path.join(cand, RECIPE_INDEX_FILE);
      let raw: string;
      try {
        raw = fs.readFileSync(indexFile, "utf8");
      } catch {
        continue; // no index here, try the next candidate
      }
      try {
        const parsed: unknown = JSON.parse(raw);
        const list = Array.isArray(parsed)
          ? parsed
          : (parsed as { recipes?: unknown }).recipes;
        if (!Array.isArray(list)) {
          this.loadError = `${indexFile} is not an array (or {recipes:[...]})`;
          continue;
        }
        this.entries = list.map(toEntry).filter((e): e is RecipeEntry => e !== null);
        this.dir = cand;
        return;
      } catch (err) {
        this.loadError = `${indexFile}: ${(err as Error).message}`;
      }
    }
  }

  get available(): boolean {
    this.ensureLoaded();
    return this.dir !== null;
  }

  get baseDir(): string | null {
    this.ensureLoaded();
    return this.dir;
  }

  get count(): number {
    this.ensureLoaded();
    return this.entries.length;
  }

  list(): readonly RecipeEntry[] {
    this.ensureLoaded();
    return this.entries;
  }

  unavailableMessage(): string {
    const looked = this.candidateDirs()
      .map((d) => path.join(d, RECIPE_INDEX_FILE))
      .join(", ");
    const extra = this.loadError !== null ? ` (last error: ${this.loadError})` : "";
    return `recipe library not built yet: no usable ${RECIPE_INDEX_FILE} found (looked at: ${looked})${extra}`;
  }

  find(category: string, name: string): RecipeEntry | null {
    this.ensureLoaded();
    const cat = category.toLowerCase();
    const nam = name.toLowerCase();
    return (
      this.entries.find(
        (e) => e.category.toLowerCase() === cat && e.name.toLowerCase() === nam,
      ) ?? null
    );
  }

  /** Read a recipe's full markdown body; never escapes the recipes dir. */
  readBody(entry: RecipeEntry): string {
    this.ensureLoaded();
    if (this.dir === null) return this.unavailableMessage();
    const base = path.resolve(this.dir);
    const abs = path.resolve(base, entry.path);
    if (abs !== base && !abs.startsWith(base + path.sep)) {
      return `(recipe path escapes the library dir: ${entry.path})`;
    }
    try {
      return fs.readFileSync(abs, "utf8");
    } catch (err) {
      return `(recipe file missing or unreadable: ${entry.path}: ${(err as Error).message})`;
    }
  }

  /**
   * Search: exact name match wins outright; otherwise tokenized scoring with
   * name hit x3, tag hit x3, description hit x2, doubled when every token
   * hits at least one field.
   */
  search(query: string, opts: RecipeSearchOptions = {}): RecipeSearchResult {
    this.ensureLoaded();
    const topN = opts.topN !== undefined && opts.topN > 0 ? opts.topN : 3;
    const wantedTags = (opts.tags ?? []).map((t) => t.toLowerCase()).filter((t) => t.length > 0);
    const pool = this.entries.filter((e) => {
      if (wantedTags.length === 0) return true;
      const have = new Set(e.tags.map((t) => t.toLowerCase()));
      return wantedTags.every((t) => have.has(t));
    });

    const exactName = query.trim().toLowerCase();
    const exact = pool.find((e) => e.name.toLowerCase() === exactName);
    if (exact) {
      return { exact: true, totalMatches: 1, hits: [{ entry: exact, score: Number.MAX_SAFE_INTEGER }] };
    }

    const tokens = tokenize(query);
    if (tokens.length === 0) return { exact: false, totalMatches: 0, hits: [] };

    const scored: RecipeHit[] = [];
    for (const entry of pool) {
      const name = entry.name.toLowerCase();
      const tags = entry.tags.map((t) => t.toLowerCase());
      const desc = entry.description.toLowerCase();
      let score = 0;
      let allTokensHit = true;
      for (const tok of tokens) {
        let hit = false;
        if (name.includes(tok)) {
          score += 3;
          hit = true;
        }
        if (tags.some((t) => t.includes(tok))) {
          score += 3;
          hit = true;
        }
        if (desc.includes(tok)) {
          score += 2;
          hit = true;
        }
        if (!hit) allTokensHit = false;
      }
      if (score <= 0) continue;
      if (allTokensHit) score *= 2; // AND-boost
      scored.push({ entry, score });
    }
    scored.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
    return { exact: false, totalMatches: scored.length, hits: scored.slice(0, topN) };
  }
}
