/**
 * WCAG 2.x relative luminance and contrast ratio, sRGB.
 *
 * Used by the contrast guard, which walks the theme object rather than a
 * hardcoded list — so editing the palette fails the test rather than silently
 * shipping an unreadable token.
 */

export type Rgb = { r: number; g: number; b: number };

export function parseHex(hex: string): Rgb {
  const raw = hex.trim().replace(/^#/, "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`not a hex colour: ${hex}`);
  }

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** WCAG relative luminance. Channels are linearised before weighting. */
export function relativeLuminance(colour: string | Rgb): number {
  const { r, g, b } = typeof colour === "string" ? parseHex(colour) : colour;

  const linearise = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/** Contrast ratio between two opaque colours, from 1 to 21. Order-independent. */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG 2.x AA thresholds. */
export const AA_BODY_TEXT = 4.5;
/** Large text (>=18.66px bold or >=24px) and non-text UI boundaries. */
export const AA_LARGE_TEXT_AND_UI = 3;
