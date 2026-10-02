import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

/** A titled block on a multi-section screen (catalog, media kit, health writes). */
export function ScreenSection({
  title,
  caption,
  actions,
  children,
}: {
  title: string;
  caption?: ReactNode;
  /** Controls for the whole section, on the title's line at the right. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box component="section" sx={{ mb: 5 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          mb: caption ? 0.75 : 2,
        }}
      >
        <Typography variant="h3" sx={{ fontSize: 22, fontWeight: 700 }}>
          {title}
        </Typography>
        {actions}
      </Box>
      {caption && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {caption}
        </Typography>
      )}
      {children}
    </Box>
  );
}
