import { describe, expect, it } from "vitest";
import {
  AA_BODY_TEXT,
  AA_LARGE_TEXT_AND_UI,
  contrastRatio,
} from "../../src/theme/contrast";
import { CONTRAST_CONTRACT, palette } from "../../src/theme/palette";
import { theme } from "../../src/theme/theme";

const bar = { body: AA_BODY_TEXT, ui: AA_LARGE_TEXT_AND_UI } as const;

describe("every rendered colour pairing clears its WCAG bar", () => {
  it.each(CONTRAST_CONTRACT)("$name", ({ fg, bg, min }) => {
    const ratio = contrastRatio(fg, bg);
    expect(
      ratio,
      `${fg} on ${bg} is ${ratio.toFixed(2)}:1, below the ${bar[min]}:1 bar`,
    ).toBeGreaterThanOrEqual(bar[min]);
  });
});

describe("the theme cannot reintroduce the known defects", () => {
  // The whole reason primary.dark exists. If someone "simplifies" the theme by
  // pointing text at primary.main, this fails.
  it("keeps the brand red out of any text role", () => {
    expect(theme.palette.primary.dark).toBe(palette.brandRedText);
    expect(theme.palette.primary.main).toBe(palette.brandRed);
    expect(theme.palette.primary.dark).not.toBe(theme.palette.primary.main);
  });

  it("resolves contained primary buttons to the text-safe red", () => {
    const overrides = theme.components?.MuiButton?.styleOverrides?.containedPrimary as
      | { backgroundColor?: string }
      | undefined;

    expect(
      overrides?.backgroundColor,
      "contained primary must not fall through to palette.primary.main",
    ).toBe(palette.brandRedText);

    expect(
      contrastRatio(theme.palette.primary.contrastText, palette.brandRedText),
    ).toBeGreaterThanOrEqual(AA_BODY_TEXT);
  });

  it("does not use the failing label grey as secondary text", () => {
    expect(theme.palette.text.secondary).toBe(palette.textSecondary);
    expect(theme.palette.text.secondary).not.toBe(palette.labelNonText);
  });

  it("uses the readable disabled grey", () => {
    expect(theme.palette.action.disabled).toBe(palette.disabled);
    expect(contrastRatio(palette.disabled, palette.ground)).toBeGreaterThanOrEqual(
      AA_LARGE_TEXT_AND_UI,
    );
  });
});
