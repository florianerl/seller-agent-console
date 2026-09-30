import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { palette } from "../theme/palette";
import { InfoTip } from "./InfoTip";

/**
 * One section of an open record: a titled, outlined card. The row used to be
 * one grey column of 12px headings and captions, where nothing separated
 * one concern from the next; a card per concern gives the eye edges to stop
 * at. `info` holds the background a reader wants once, `meta` the section's
 * freshness.
 */
export function DetailCard({
  title,
  info,
  infoNote,
  meta,
  children,
  block,
  danger,
}: {
  title: ReactNode;
  info?: string | undefined;
  /** `data-note` on the (i), for the tests that read what it explains. */
  infoNote?: string;
  meta?: ReactNode;
  children: ReactNode;
  block: string;
  /** Outlined in the error colour: what is in here cannot be taken back. */
  danger?: boolean;
}) {
  return (
    <Paper variant="outlined" sx={{
        p: 2,
        borderColor: danger ? palette.error : palette.line,
        // A container of its own, so what is inside can lay itself out by the
        // width of this card rather than of the page.
        containerType: "inline-size",
      }} data-block={block}>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1.25, minHeight: 28 }} flexWrap="wrap" useFlexGap>
        <Typography component="h3" sx={{ fontSize: 14, fontWeight: 600 }}>
          {title}
        </Typography>
        {info && <InfoTip title={info} {...(infoNote ? { "data-note": infoNote } : {})} />}
        <Box sx={{ flex: 1 }} />
        {meta}
      </Stack>
      {children}
    </Paper>
  );
}
