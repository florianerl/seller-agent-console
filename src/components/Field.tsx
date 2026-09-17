import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import { palette } from "../theme/palette";

/** A labelled value in a detail grid. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Box sx={{ fontSize: 11, color: palette.textSecondary, textTransform: "uppercase" }}>
        {label}
      </Box>
      <Box sx={{ fontSize: 13 }}>{children}</Box>
    </Box>
  );
}

/** A responsive grid of Fields. */
export function FieldGrid({ children, min = 140, ...rest }: { children: ReactNode; min?: number } & Record<string, unknown>) {
  return (
    <Box
      {...rest}
      sx={{
        display: "grid",
        gap: 1.5,
        gridTemplateColumns: `repeat(auto-fit,minmax(${min}px,1fr))`,
      }}
    >
      {children}
    </Box>
  );
}
