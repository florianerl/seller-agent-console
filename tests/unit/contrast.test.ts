import { describe, expect, it } from "vitest";
import { contrastRatio, parseHex, relativeLuminance } from "../../src/theme/contrast";

describe("contrast maths", () => {
  it("parses long and short hex, with or without a hash", () => {
    expect(parseHex("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex("000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseHex("#EE3126")).toEqual({ r: 238, g: 49, b: 38 });
  });

  it("rejects anything that is not a colour", () => {
    expect(() => parseHex("nope")).toThrow();
    expect(() => parseHex("#12345")).toThrow();
  });

  it("anchors luminance at the extremes", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
  });

  it("gives the known 21:1 and 1:1 ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
    expect(contrastRatio("#ff0000", "#ff0000")).toBeCloseTo(1, 5);
  });

  it("is order-independent", () => {
    expect(contrastRatio("#EE3126", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#EE3126"),
      10,
    );
  });

  // The defect that motivated the whole exercise: the brand red fails AA as
  // text, and the darkened variant passes. If either of these numbers moves,
  // the palette decision needs revisiting.
  it("reproduces the brand red defect and its fix", () => {
    expect(contrastRatio("#EE3126", "#ffffff")).toBeCloseTo(4.12, 1);
    expect(contrastRatio("#D42418", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});
