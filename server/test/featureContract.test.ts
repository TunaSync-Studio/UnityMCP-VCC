// Cross-language contract: the server submits a real vrc_upload only to a
// plugin whose welcome advertises ARM_CLAIM_FEATURE, so the Unity plugin must
// advertise that exact string. Unity is not available in CI, so this reads
// the plugin source; the EditMode test UploadArmClaimTests checks the
// compiled welcome.
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ARM_CLAIM_FEATURE } from "../src/armGate.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginEditor = path.resolve(here, "../../package/com.tunasync.unity-mcp/Editor");

function buildFeaturesBody(): string {
  const src = fs.readFileSync(path.join(pluginEditor, "Handlers/SysHandlers.cs"), "utf8");
  const start = src.indexOf("string[] BuildFeatures()");
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf("return features.ToArray();", start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("server/plugin feature contract", () => {
  it("the plugin advertises the arm-claim feature the server requires", () => {
    const body = buildFeaturesBody();
    expect(ARM_CLAIM_FEATURE).toBe("vrcUploadArmClaim");
    // Listed unconditionally - not behind an #if that could compile it out.
    const unconditional = body.slice(0, body.search(/^#if /m) === -1 ? undefined : body.search(/^#if /m));
    expect(unconditional).toContain(`"${ARM_CLAIM_FEATURE}"`);
  });

  it("the plugin's vrc.upload claims the arm before the real upload", () => {
    const src = fs.readFileSync(path.join(pluginEditor, "Handlers/VrcHandlers.cs"), "utf8");
    const claim = src.indexOf("ClaimArmOrThrow();");
    const upload = src.indexOf("return await RealUpload(");
    expect(claim).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(claim);
    expect(src).toContain("UploadArmClaim.TryClaim(");
  });
});
