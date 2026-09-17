import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { describe } from "../api/errors";
import type { Resource } from "../query/freshness";
import { palette } from "../theme/palette";

function timeOnly(at: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}

/** The rule colour carries the state, but never alone — the caption says it too. */
const RULE = {
  live: palette.ok,
  stale: palette.warning,
  blocked: palette.error,
  empty: palette.disabled,
} as const;

export function StatusCard<T>({
  title,
  testId,
  resource,
  children,
}: {
  title: string;
  testId: string;
  resource: Resource<T>;
  children: (data: T) => ReactNode;
}) {
  const { data, asOf, freshness, result, loading } = resource;

  return (
    <Paper
      variant="outlined"
      data-card={testId}
      data-state={freshness}
      sx={{
        p: 3,
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <Box
          aria-hidden
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: RULE[freshness],
            flexShrink: 0,
          }}
        />
        <Typography variant="h3" component="h3">
          {title}
        </Typography>
      </Box>

      <Box sx={{ flex: 1 }}>
        {loading && !data && freshness !== "blocked" ? (
          <Skeleton variant="text" width="70%" height={32} />
        ) : freshness === "blocked" ? (
          <Typography variant="body2" sx={{ color: palette.error }}>
            {result ? describe(result) : "access denied"}
          </Typography>
        ) : data !== undefined ? (
          <Box sx={{ fontSize: 15 }}>{children(data)}</Box>
        ) : (
          <Typography variant="body2" sx={{ color: palette.textSecondary }}>
            {result ? describe(result) : "no data yet"}
          </Typography>
        )}
      </Box>

      <Typography
        variant="caption"
        component="p"
        data-freshness={freshness}
        sx={{
          mt: 2,
          display: "block",
          color: freshness === "stale" ? palette.warningText : palette.textSecondary,
        }}
      >
        {freshness === "live" && asOf !== undefined && `as of ${timeOnly(asOf)}`}
        {freshness === "stale" &&
          asOf !== undefined &&
          `couldn't refresh — showing ${timeOnly(asOf)}`}
        {freshness === "blocked" && "value hidden while access is denied"}
        {freshness === "empty" && !loading && "never loaded"}
      </Typography>
    </Paper>
  );
}
