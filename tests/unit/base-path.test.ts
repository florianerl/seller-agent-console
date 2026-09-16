import { describe, expect, it } from "vitest";
import { normalise } from "../../config/base-path";

// A pure unit. The corresponding guard (tests/guards/base-path.guard.test.ts)
// asserts the built artefacts actually honour the result.
describe("normalise", () => {
  it("always produces a leading and trailing slash", () => {
    expect(normalise("seller-agent-console")).toBe("/seller-agent-console/");
    expect(normalise("/seller-agent-console")).toBe("/seller-agent-console/");
    expect(normalise("seller-agent-console/")).toBe("/seller-agent-console/");
    expect(normalise("/seller-agent-console/")).toBe("/seller-agent-console/");
  });

  it("collapses doubled slashes", () => {
    expect(normalise("//a//b//")).toBe("/a/b/");
  });

  it("treats empty and root as root", () => {
    expect(normalise("")).toBe("/");
    expect(normalise("/")).toBe("/");
    expect(normalise("  ")).toBe("/");
  });

  // actions/configure-pages emits the path without a trailing slash, so this
  // is the exact shape CI feeds in.
  it("handles the configure-pages output shape", () => {
    expect(normalise("/seller-agent-console")).toBe("/seller-agent-console/");
  });
});
