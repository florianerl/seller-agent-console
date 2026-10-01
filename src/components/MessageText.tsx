import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import { palette } from "../theme/palette";

/**
 * Chat text as a reader would expect it: paragraphs, lists, headings, **bold**
 * and `code`. Hand-rolled for the same reason as JsonView — a markdown library
 * is a dependency (and an HTML-injection surface) for a handful of constructs.
 * The output is React elements over text nodes, never `innerHTML`, because the
 * message is the agent's and not ours to trust; anything unrecognised simply
 * stays literal text.
 */
const INLINE = /\*\*([^*]+)\*\*|`([^`]+)`/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(
      m[1] !== undefined ? (
        <strong key={i++}>{m[1]}</strong>
      ) : (
        <code key={i++} style={{ fontFamily: "monospace", fontSize: "0.92em" }}>
          {m[2]}
        </code>
      ),
    );
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "h"; text: string }
  | { kind: "ul" | "ol"; items: string[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^#{1,6}\s+(.*)$/;

function parse(text: string): Block[] {
  const blocks: Block[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const last = blocks[blocks.length - 1];
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    const heading = HEADING.exec(line);
    if (!line.trim()) {
      blocks.push({ kind: "p", lines: [] });
    } else if (heading) {
      blocks.push({ kind: "h", text: heading[1] ?? "" });
    } else if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      const item = (bullet ?? numbered)?.[1] ?? "";
      if (last && last.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else if (last && last.kind === "p") {
      last.lines.push(line);
    } else {
      blocks.push({ kind: "p", lines: [line] });
    }
  }
  return blocks.filter((b) => b.kind !== "p" || b.lines.length > 0);
}

export function MessageText({ text }: { text: string }) {
  return (
    <Box
      data-message-text
      sx={{
        fontSize: 13,
        lineHeight: 1.5,
        color: palette.text,
        overflowWrap: "anywhere",
        "& p, & ul, & ol": { m: 0, mb: 1 },
        "& > :last-child": { mb: 0 },
        "& ul, & ol": { pl: 3 },
      }}
    >
      {parse(text).map((block, i) => {
        if (block.kind === "h") {
          return (
            <Box key={i} sx={{ fontWeight: 600, mb: 0.5 }}>
              {inline(block.text)}
            </Box>
          );
        }
        if (block.kind === "p") {
          return (
            <p key={i}>
              {block.lines.map((line, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  {inline(line)}
                </span>
              ))}
            </p>
          );
        }
        const List = block.kind;
        return (
          <List key={i}>
            {block.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </List>
        );
      })}
    </Box>
  );
}
