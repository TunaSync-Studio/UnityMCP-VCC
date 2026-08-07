// RecipeLibrary: index loading, exact-name hit, keyword scoring, names_only
// projection and the missing-index message.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RecipeLibrary } from "../src/recipes.js";

const BAKE_BODY = "# bake_lighting\n\nBake scene lighting with the progressive GPU lightmapper.\n";
const PHYS_BODY = "# physbone_setup\n\nSet up PhysBones on hair and skirt chains.\n";
const HAIR_BODY = "# hair_material\n\nAuthor a hair shader material.\n";

function writeFixture(dir: string): void {
  fs.mkdirSync(path.join(dir, "lighting"), { recursive: true });
  fs.mkdirSync(path.join(dir, "avatar"), { recursive: true });
  fs.mkdirSync(path.join(dir, "materials"), { recursive: true });
  const index = [
    {
      name: "bake_lighting",
      category: "lighting",
      tags: ["bake", "lightmap"],
      description: "Bake scene lighting with progressive GPU lightmapper",
      kind: "recipe",
      sync: "sync",
      requires: [],
      qa: "clean",
      path: "lighting/bake_lighting.md",
      sha1: "0000000000000000000000000000000000000001",
    },
    {
      name: "physbone_setup",
      category: "avatar",
      tags: ["physbone", "dynamics"],
      description: "Set up PhysBones on hair and skirt chains",
      kind: "recipe",
      sync: "sync",
      requires: [],
      qa: "clean",
      path: "avatar/physbone_setup.md",
      sha1: "0000000000000000000000000000000000000002",
    },
    {
      name: "hair_material",
      category: "materials",
      tags: ["material", "shader"],
      description: "Author a hair shader; mentions physbone only in the description",
      kind: "recipe",
      sync: "sync",
      requires: [],
      qa: "clean",
      path: "materials/hair_material.md",
      sha1: "0000000000000000000000000000000000000003",
    },
  ];
  fs.writeFileSync(path.join(dir, "_index.json"), JSON.stringify(index, null, 2), "utf8");
  fs.writeFileSync(path.join(dir, "lighting", "bake_lighting.md"), BAKE_BODY, "utf8");
  fs.writeFileSync(path.join(dir, "avatar", "physbone_setup.md"), PHYS_BODY, "utf8");
  fs.writeFileSync(path.join(dir, "materials", "hair_material.md"), HAIR_BODY, "utf8");
}

describe("RecipeLibrary", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-recipes-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("loads the index lazily and reports availability", () => {
    writeFixture(tmp);
    const lib = new RecipeLibrary(tmp);
    expect(lib.available).toBe(true);
    expect(lib.count).toBe(3);
    expect(lib.baseDir).toBe(tmp);
  });

  it("exact name match returns that single recipe (full body readable)", () => {
    writeFixture(tmp);
    const lib = new RecipeLibrary(tmp);
    const res = lib.search("hair_material");
    expect(res.exact).toBe(true);
    expect(res.totalMatches).toBe(1);
    expect(res.hits).toHaveLength(1);
    const hit = res.hits[0];
    expect(hit?.entry.name).toBe("hair_material");
    expect(lib.readBody(hit!.entry)).toBe(HAIR_BODY);
  });

  it("exact match is case-insensitive", () => {
    writeFixture(tmp);
    const lib = new RecipeLibrary(tmp);
    const res = lib.search("  Physbone_Setup ");
    expect(res.exact).toBe(true);
    expect(res.hits[0]?.entry.name).toBe("physbone_setup");
  });

  it("ranks a name/tag hit above a description-only hit", () => {
    writeFixture(tmp);
    const lib = new RecipeLibrary(tmp);
    const res = lib.search("physbone");
    expect(res.exact).toBe(false);
    expect(res.totalMatches).toBe(2); // physbone_setup + hair_material (desc)
    expect(res.hits[0]?.entry.name).toBe("physbone_setup");
    expect(res.hits[1]?.entry.name).toBe("hair_material");
    expect(res.hits[0]!.score).toBeGreaterThan(res.hits[1]!.score);
  });

  it("applies the AND-boost when every token hits", () => {
    writeFixture(tmp);
    const lib = new RecipeLibrary(tmp);
    // "bake lighting" - both tokens hit bake_lighting (name+tag+desc).
    const res = lib.search("bake lighting");
    expect(res.hits[0]?.entry.name).toBe("bake_lighting");
    // name(3+3) + tag(3) + desc(2+2) ... exact arithmetic aside, the boost
    // must put it well above a single-token hit baseline.
    expect(res.hits[0]!.score).toBeGreaterThanOrEqual(10);
  });

  it("filters by required tags", () => {
    writeFixture(tmp);
    const lib = new RecipeLibrary(tmp);
    const res = lib.search("hair", { tags: ["dynamics"] });
    expect(res.totalMatches).toBe(1);
    expect(res.hits[0]?.entry.name).toBe("physbone_setup");
  });

  it("limits results to topN", () => {
    writeFixture(tmp);
    const lib = new RecipeLibrary(tmp);
    const res = lib.search("physbone hair bake", { topN: 1 });
    expect(res.hits).toHaveLength(1);
    expect(res.totalMatches).toBeGreaterThan(1);
  });

  it("reports a clear message when the index is missing (no throw)", () => {
    const lib = new RecipeLibrary(tmp); // dir exists but has no _index.json
    expect(lib.available).toBe(false);
    expect(lib.unavailableMessage()).toContain("not built yet");
    expect(lib.unavailableMessage()).toContain("_index.json");
    expect(lib.search("anything").hits).toHaveLength(0);
  });

  it("never reads outside the recipes dir", () => {
    writeFixture(tmp);
    const lib = new RecipeLibrary(tmp);
    const body = lib.readBody({
      name: "evil",
      category: "x",
      tags: [],
      description: "",
      path: "../../outside.md",
    });
    expect(body).toContain("escapes");
  });

  it("finds entries by category/name for resource reads", () => {
    writeFixture(tmp);
    const lib = new RecipeLibrary(tmp);
    expect(lib.find("lighting", "bake_lighting")?.path).toBe("lighting/bake_lighting.md");
    expect(lib.find("LIGHTING", "BAKE_LIGHTING")?.name).toBe("bake_lighting");
    expect(lib.find("lighting", "nope")).toBeNull();
  });
});
