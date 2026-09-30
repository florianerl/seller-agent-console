import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import { palette } from "../theme/palette";

/**
 * A JSON value, indented and coloured. Hand-rolled on purpose: a highlighting
 * library is a dependency for what one regular expression does, and this
 * console takes no third-party code it can do without.
 *
 * The input is `JSON.stringify` output, so every token is well-formed and the
 * pattern only has to tell the five kinds apart — a key is a string followed
 * by a colon. Colours are palette tokens that the contrast guard walks; the
 * markup is text nodes and spans, never `innerHTML`, because the values are the
 * agent's and not ours to trust.
 */
const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

function highlight(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const [whole, str, colon, num] = m;
    const color = str
      ? colon
        ? palette.jsonKey
        : palette.jsonString
      : num
        ? palette.jsonNumber
        : palette.jsonKeyword;
    if (str && colon) {
      out.push(
        <span key={i++} style={{ color }}>
          {str}
        </span>,
        colon,
      );
    } else {
      out.push(
        <span key={i++} style={{ color }}>
          {whole}
        </span>,
      );
    }
    last = at + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** `undefined` and functions have no JSON form; show them rather than crash. */
function serialise(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? String(value);
}

export function JsonView({
  value,
  maxHeight = 320,
  "data-payload": payload,
}: {
  value: unknown;
  maxHeight?: number;
  "data-payload"?: string;
}) {
  return (
    <Box
      component="pre"
      {...(payload ? { "data-payload": payload } : {})}
      sx={{
        m: 0,
        p: 1.5,
        maxHeight,
        overflow: "auto",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 12,
        lineHeight: 1.5,
        color: palette.textSecondary,
        backgroundColor: palette.ground,
        border: `1px solid ${palette.line}`,
        borderRadius: 1,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {highlight(serialise(value))}
    </Box>
  );
}
