import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

/** The shared page title block. Screens stop restyling h2 themselves. */
export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: { xs: "flex-start", sm: "flex-end" },
        justifyContent: "space-between",
        gap: 2,
        mb: 3,
        flexWrap: "wrap",
      }}
    >
      <Box sx={{ minWidth: 0, flex: "1 1 280px" }}>
        {eyebrow && (
          <Typography variant="overline" component="p" sx={{ mb: 0.5 }}>
            {eyebrow}
          </Typography>
        )}
        <Typography variant="h2">{title}</Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, maxWidth: 720 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", pb: 0.25 }}>{actions}</Box>
      )}
    </Box>
  );
}
