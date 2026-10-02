import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { palette } from "../theme/palette";
import { FormRow } from "./WriteForm";

/**
 * The "More options" toggle AvailsCheck uses, with one addition: collapsed,
 * it says how many hidden fields are filled in. A value that goes out on the
 * wire should never be out of sight without a trace — a buyer tier typed and
 * then folded away would otherwise change every search with nothing on
 * screen to say so.
 */
export function MoreOptionsToggle({
  open,
  onToggle,
  set,
}: {
  open: boolean;
  onToggle: () => void;
  /** How many of the hidden fields hold a value. */
  set: number;
}) {
  return (
    <Button size="small" onClick={onToggle} aria-expanded={open} sx={{ flexShrink: 0 }}>
      {open ? "Fewer options" : set > 0 ? `More options (${set} set)` : "More options"}
    </Button>
  );
}

/** A captioned row of optional fields inside a "More options" panel. */
export function OptionGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" component="div" sx={{ mb: 0.75, color: palette.textSecondary }}>
        {title}
      </Typography>
      <FormRow>{children}</FormRow>
    </Box>
  );
}
