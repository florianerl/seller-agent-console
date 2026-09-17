import type { ReactNode } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";

/**
 * The confirmation every mutation call site puts in front of itself.
 *
 * Shared so the shape is the same everywhere — the sign-out dialog's shape,
 * which people have already learned — and so the awkward question is asked in
 * one place rather than skipped in a few. `consequence` is required: a dialog
 * that only asks "are you sure?" teaches people to click through it, so each
 * caller has to say what this particular call does and what it leaves behind
 * if it fails halfway.
 */
export function ConfirmAction({
  open,
  title,
  consequence,
  confirmLabel,
  pending = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  consequence: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onClose={pending ? undefined : onCancel}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText component="div">{consequence}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          data-action="confirm-mutation"
          disabled={pending}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
