import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

/** A titled block on a multi-section screen (catalog, media kit, health writes). */
export function ScreenSection({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box component="section" sx={{ mb: 5 }}>
      <Typography variant="h3" sx={{ mb: caption ? 0.75 : 2, fontSize: 22, fontWeight: 700 }}>
        {title}
      </Typography>
      {caption && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {caption}
        </Typography>
      )}
      {children}
    </Box>
  );
}
