import Chip from "@mui/material/Chip";
import { palette } from "../theme/palette";

/**
 * Colour is a hint, never the only signal: the label always carries the status
 * in words, so nothing depends on distinguishing hues.
 */
const TONE: Record<string, string> = {
  approved: palette.ok,
  active: palette.ok,
  delivering: palette.ok,
  completed: palette.ok,
  rejected: palette.error,
  cancelled: palette.error,
  failed: palette.error,
  pending_approval: palette.warningText,
  submitted: palette.warningText,
};

export function StatusChip({ status }: { status: string }) {
  const colour = TONE[status] ?? palette.textSecondary;
  return (
    <Chip
      label={status.replace(/_/g, " ")}
      size="small"
      variant="outlined"
      data-status={status}
      sx={{ fontSize: 12, color: colour, borderColor: colour }}
    />
  );
}
