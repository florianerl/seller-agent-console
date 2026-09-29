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
  // OpenProposal lifecycle words; none collide with another screen's vocabulary.
  published: palette.ok,
  agreed: palette.ok,
  under_review: palette.warningText,
  withdrawn: palette.error,
  // Change requests: applied is done; pending review is waiting on someone.
  applied: palette.ok,
  pending: palette.warningText,
  validating: palette.warningText,
  // Change-request severity. Critical needs review like material does, but
  // it is the one to read first.
  critical: palette.error,
  material: palette.warningText,
  sold_out: palette.error,
};

export function StatusChip({ status }: { status: string }) {
  const colour = TONE[status] ?? palette.textSecondary;
  return (
    <Chip
      label={status.replace(/_/g, " ")}
      size="small"
      variant="outlined"
      data-status={status}
      sx={{ color: colour, borderColor: colour }}
    />
  );
}
