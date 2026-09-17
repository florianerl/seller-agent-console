import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import { palette } from "../theme/palette";

/** Outlined surface for tables, empty states, and query results. */
export function DataPanel({
  children,
  header,
}: {
  children: ReactNode;
  header?: ReactNode;
}) {
  return (
    <Box>
      {header}
      <Paper variant="outlined" sx={{ overflow: "auto" }}>
        {children}
      </Paper>
    </Box>
  );
}

export function FreshnessNote({
  freshness,
  children,
}: {
  freshness: string;
  children: ReactNode;
}) {
  return (
    <Box
      data-freshness={freshness}
      sx={{
        mb: 1,
        fontSize: 13,
        color: freshness === "stale" ? palette.warningText : palette.textSecondary,
      }}
    >
      {children}
    </Box>
  );
}

/** Main column width — marketing-site columns, not full-bleed admin. */
export const CONTENT_MAX_WIDTH = 1200;
