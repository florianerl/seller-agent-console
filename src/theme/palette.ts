/**
 * Brand tokens, sampled from the IAB logo and site, with the contrast defects
 * corrected. Ratios in the comments are computed by tests/guards/contrast.guard.test.ts
 * against these exact values — they are asserted, not annotated.
 */

export const palette = {
  /** Fills, accents, chips, the brand mark. 4.12:1 on white — NEVER text, never a button background. */
  brandRed: "#EE3126",
  /** The text-safe red: 5.17:1 on white, 4.79:1 on ground. Active nav, links, contained buttons. */
  brandRedText: "#D42418",

  brandBlack: "#221F1F",

  text: "#3F3F3F",
  textSecondary: "#5D5D5D",
  /** 4.12:1 on white — fails AA as text. Retained for non-text use only. */
  labelNonText: "#7D7D7D",
  /** Disabled / "soon" items. 3.20:1 on ground, clearing the 3:1 non-text bar. */
  disabled: "#8a8a8a",

  line: "#E4E4E4",
  ground: "#F7F6F6",
  paper: "#FFFFFF",

  ok: "#1F7A3F",
  /** 3.64:1 on white — fills and icons only. */
  warning: "#B7791F",
  /** Darkened for warning *text*. */
  warningText: "#8A5A13",
  /**
   * The writes-enabled chip. Amber rather than red: the console being able to
   * write is a mode, not a fault, and red here would compete with the error
   * colour on the same screen. 8.78:1 under brandBlack text.
   */
  attention: "#F0B429",
  error: "#B3261E",
  errorBg: "#fdecea",
} as const;

/**
 * The (foreground, background) pairs the application actually renders, and the
 * bar each must clear. The guard iterates this — adding a colour pairing to the
 * UI means adding it here, which is the point.
 */
export const CONTRAST_CONTRACT: ReadonlyArray<{
  name: string;
  fg: string;
  bg: string;
  min: "body" | "ui";
}> = [
  { name: "body text on paper", fg: palette.text, bg: palette.paper, min: "body" },
  { name: "body text on ground", fg: palette.text, bg: palette.ground, min: "body" },
  { name: "secondary text on paper", fg: palette.textSecondary, bg: palette.paper, min: "body" },
  { name: "secondary text on ground", fg: palette.textSecondary, bg: palette.ground, min: "body" },
  { name: "active nav text on ground", fg: palette.brandRedText, bg: palette.ground, min: "body" },
  { name: "link text on paper", fg: palette.brandRedText, bg: palette.paper, min: "body" },
  { name: "contained button label", fg: palette.paper, bg: palette.brandRedText, min: "body" },
  { name: "heading on paper", fg: palette.brandBlack, bg: palette.paper, min: "body" },
  { name: "ok status text on paper", fg: palette.ok, bg: palette.paper, min: "body" },
  { name: "error status text on paper", fg: palette.error, bg: palette.paper, min: "body" },
  { name: "error text on error background", fg: palette.error, bg: palette.errorBg, min: "body" },
  { name: "warning text on paper", fg: palette.warningText, bg: palette.paper, min: "body" },
  // "soon" nav items were held to the 3:1 UI bar on the grounds that WCAG
  // 1.4.3 exempts disabled controls. They are not controls — Sidebar renders
  // them as plain list items precisely so a screen reader does not announce a
  // button that does nothing — so the exemption never applied and the real bar
  // is 4.5:1. This contract asserted the comfortable reading of its own
  // component; axe in a real browser is what caught it.
  { name: "soon nav label on paper", fg: palette.textSecondary, bg: palette.paper, min: "body" },
  { name: "soon nav label on ground", fg: palette.textSecondary, bg: palette.ground, min: "body" },
  // Kept for genuinely disabled controls, where the exemption does hold.
  { name: "disabled control on ground", fg: palette.disabled, bg: palette.ground, min: "ui" },
  { name: "warning fill on paper", fg: palette.warning, bg: palette.paper, min: "ui" },
  // The writes chip carries text, on an amber fill, on the black app bar. The
  // label is what has to be readable, so it is held to the body bar.
  { name: "writes chip label on attention", fg: palette.brandBlack, bg: palette.attention, min: "body" },
  { name: "writes chip fill on app bar", fg: palette.attention, bg: palette.brandBlack, min: "ui" },
];
