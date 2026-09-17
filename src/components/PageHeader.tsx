import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { CONTENT_MAX_WIDTH } from "./DataPanel";
import { palette } from "../theme/palette";

/**
 * The page title sits in a full-bleed dark band, the same rhythm as IAB Tech
 * Lab's hero strips: white chrome above, dark statement, then the work.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
  children?: ReactNode;
}) {
  return (
    <>
      <Box
        sx={{
          backgroundColor: palette.brandBlack,
          color: palette.paper,
          width: "100%",
          mb: 4,
          py: { xs: 4, md: 6 },
        }}
      >
        <Box
          sx={{
            maxWidth: CONTENT_MAX_WIDTH,
            mx: "auto",
            px: { xs: 2.5, md: 4 },
            display: "flex",
            alignItems: { xs: "flex-start", sm: "flex-end" },
            justifyContent: "space-between",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <Box sx={{ minWidth: 0, flex: "1 1 280px" }}>
            {eyebrow && (
              <Typography
                variant="overline"
                component="p"
                sx={{ mb: 1, color: palette.onDarkMuted }}
              >
                {eyebrow}
              </Typography>
            )}
            <Typography variant="h2" sx={{ color: palette.paper }}>
              {title}
            </Typography>
            {subtitle && (
              <Typography
                variant="body1"
                sx={{ mt: 1.25, maxWidth: 720, color: palette.onDarkMuted }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
          {actions && (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", pb: 0.25 }}>{actions}</Box>
          )}
        </Box>
      </Box>
      {children && (
        <Box
          sx={{
            maxWidth: CONTENT_MAX_WIDTH,
            mx: "auto",
            px: { xs: 2.5, md: 4 },
            pb: "calc(env(safe-area-inset-bottom) + 32px)",
          }}
        >
          {children}
        </Box>
      )}
    </>
  );
}
