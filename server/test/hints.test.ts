import { describe, expect, it } from "vitest";
import { hintFor } from "../src/errors.js";

describe("hintFor (post-publish F-B/F-C: remedy hints on opaque errors)", () => {
  it("LEASE_HELD points at session_lease takeover, not waiting", () => {
    const h = hintFor({ code: "LEASE_HELD", message: "write lease held by 'abc'", retryable: false });
    expect(h).toMatch(/session_lease/);
    expect(h).toMatch(/takeover/);
    expect(h).toMatch(/waiting will not free it/);
  });

  it("METHOD_NOT_FOUND for ndmf.bake points at installing NDMF", () => {
    const h = hintFor({
      code: "METHOD_NOT_FOUND",
      message: "no job executor registered for 'ndmf.bake'",
      retryable: false,
    });
    expect(h).toMatch(/NDMF/);
    expect(h).toMatch(/nadena\.dev\.ndmf/);
  });

  it("stays silent for methods and codes it does not understand", () => {
    expect(
      hintFor({ code: "METHOD_NOT_FOUND", message: "no job executor registered for 'other'", retryable: false }),
    ).toBeUndefined();
    expect(hintFor({ code: "HANDLER_EXCEPTION", message: "boom", retryable: false })).toBeUndefined();
  });
});
