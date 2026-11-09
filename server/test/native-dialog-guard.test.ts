// native_dialog must never answer a human-only dialog (copyright
// certification, terms, consent, account prompts), even with confirm:true.
// The OS side (pid lookup, dialog enumeration, the click itself) is mocked so
// this runs everywhere; the real click helper re-checks the same rules.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "../src/config.js";
import type { NativeDialog } from "../src/vcc.js";

const os_ = vi.hoisted(() => ({
  dialogs: [] as NativeDialog[],
  click: vi.fn(),
}));

vi.mock("../src/vcc.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/vcc.js")>();
  return {
    ...real,
    findUnityPidByProject: () => 4242,
    describeNativeDialogs: () => os_.dialogs,
    clickNativeDialogButton: (pid: number, title: string, button: string) => {
      os_.click(pid, title, button);
      os_.dialogs = [];
      return { clicked: true, pid, title, button, dialogMatches: 1, buttonMatches: 1 };
    },
  };
});

const { createMcpServer } = await import("../src/mcp/server.js");
const { RecipeLibrary } = await import("../src/recipes.js");
const { ProjectPool } = await import("../src/unity/pool.js");
const { nativeDialogClickRefusal } = await import("../src/vcc.js");

const AGREEMENT_TEXT =
  "By clicking OK, I certify that I have the necessary rights to upload this content.";

describe("nativeDialogClickRefusal", () => {
  it("refuses the VRChat copyright certification (OK + Cancel)", () => {
    expect(
      nativeDialogClickRefusal({
        title: "Copyright ownership agreement",
        buttons: ["OK", "Cancel"],
        text: AGREEMENT_TEXT,
      }),
    ).toMatch(/^human-only/);
  });

  it("refuses any two-button decision even when its text is unreadable", () => {
    expect(nativeDialogClickRefusal({ title: "Build", buttons: ["OK", "Cancel"] })).toMatch(
      /^human-only/,
    );
  });

  it("refuses a single-button dialog whose title is an agreement or account prompt", () => {
    for (const title of ["Terms of Service", "License Agreement", "Sign in", "Consent required"]) {
      expect(nativeDialogClickRefusal({ title, buttons: ["OK"] })).toMatch(/^human-only/);
    }
  });

  it("refuses a single-button dialog whose text certifies or agrees", () => {
    expect(
      nativeDialogClickRefusal({ title: "Upload", buttons: ["OK"], text: AGREEMENT_TEXT }),
    ).toMatch(/^human-only/);
  });

  it("refuses a single-button notice whose text cannot be read (fail closed)", () => {
    expect(nativeDialogClickRefusal({ title: "Notice", buttons: ["OK"] })).toMatch(/^human-only/);
    expect(nativeDialogClickRefusal({ title: "Notice", buttons: ["OK"], text: "  " })).toMatch(
      /^human-only/,
    );
  });

  it("refuses Japanese agreement / account prompts", () => {
    for (const title of ["利用規約", "同意の確認", "ライセンス", "ログインしてください", "著作権の宣誓"]) {
      expect(
        nativeDialogClickRefusal({ title, buttons: ["OK"], text: "続行します。" }),
      ).toMatch(/^human-only/);
    }
    expect(
      nativeDialogClickRefusal({
        title: "お知らせ",
        buttons: ["OK"],
        text: "OK を押すと利用規約に同意したものとみなします。",
      }),
    ).toMatch(/^human-only/);
  });

  it("allows a Japanese plain error notice", () => {
    expect(
      nativeDialogClickRefusal({
        title: "ビルドエラー",
        buttons: ["OK"],
        text: "シェーダーのコンパイルに失敗しました。",
      }),
    ).toBeUndefined();
  });

  it("allows a plain single-button error notice", () => {
    expect(
      nativeDialogClickRefusal({
        title: "Preprocess Callback Failed",
        buttons: ["OK"],
        text: "An exception occurred in a build preprocess callback.",
      }),
    ).toBeUndefined();
  });
});

describe("native_dialog tool", () => {
  let tmp = "";
  let mcp: Client | null = null;
  let close: (() => Promise<void>) | null = null;

  beforeEach(async () => {
    os_.click.mockClear();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unitymcp-dialog-"));
    const cfg: Config = { projectSelector: undefined, registryDir: tmp, defaultTimeoutMs: 5000 };
    const pool = new ProjectPool(cfg);
    const server = createMcpServer({
      pool,
      cfg,
      recipes: new RecipeLibrary(path.join(tmp, "no-recipes")),
    });
    mcp = new Client({ name: "dialog-test", version: "0.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(b), mcp.connect(a)]);
    close = async () => {
      await mcp?.close().catch(() => undefined);
      await server.close().catch(() => undefined);
      pool.disposeAll();
    };
  });

  afterEach(async () => {
    await close?.();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const call = async (title: string): Promise<CallToolResult> =>
    (await mcp!.callTool({
      name: "native_dialog",
      arguments: { project: "C:/proj", expected_title: title, button: "OK", confirm: true },
    })) as CallToolResult;

  it("does not click the copyright certification even with confirm:true", async () => {
    os_.dialogs = [
      { title: "Copyright ownership agreement", buttons: ["OK", "Cancel"], text: AGREEMENT_TEXT },
    ];
    const res = await call("Copyright ownership agreement");
    expect(res.isError).toBe(true);
    const c = res.content[0];
    expect(c?.type === "text" ? c.text : "").toMatch(/human-only/);
    expect(os_.click).not.toHaveBeenCalled();
  });

  it("still clicks OK on a single-button error notice", async () => {
    os_.dialogs = [
      {
        title: "Preprocess Callback Failed",
        buttons: ["OK"],
        text: "An exception occurred in a build preprocess callback.",
      },
    ];
    const res = await call("Preprocess Callback Failed");
    expect(res.isError).not.toBe(true);
    expect(os_.click).toHaveBeenCalledTimes(1);
  });
});
