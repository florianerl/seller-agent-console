import { useState, type ReactNode } from "react";
import Button from "@mui/material/Button";
import { ConfirmAction } from "./ConfirmAction";
import { Hint } from "./Hint";

export const WRITES_OFF_HINT =
  "Writes are switched off. Turn them on from the connection menu to use this.";

/**
 * A single write control: a button, the writes-off tooltip, and the
 * confirmation in front of the call. `WriteForm` is this plus a row of fields
 * and the outcome underneath; an inline edit in a table row needs only the
 * button, because the row is the form and owns where the outcome goes.
 */
export function ConfirmButton({
  label,
  title,
  consequence,
  confirmLabel = label,
  action,
  blocked,
  pending,
  onConfirm,
  hint,
  disabled = false,
  variant = "outlined",
  color = "primary",
}: {
  label: string;
  title: string;
  consequence: ReactNode;
  confirmLabel?: string;
  action: string;
  /** Writes are off. Disables the button and says why. */
  blocked: boolean;
  pending: boolean;
  onConfirm: () => void;
  /** Tooltip while the button is usable, or why it is disabled when writes are on. */
  hint?: ReactNode;
  /** Not ready to send — a required field is empty or invalid. Say why in `hint`. */
  disabled?: boolean;
  variant?: "contained" | "outlined" | "text";
  color?: "primary" | "inherit" | "error";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Hint hint={blocked ? WRITES_OFF_HINT : hint}>
        <Button
          variant={variant}
          color={color}
          size="small"
          data-action={action}
          disabled={blocked || disabled || pending}
          onClick={() => setOpen(true)}
          sx={{ flexShrink: 0 }}
        >
          {pending ? "Working…" : label}
        </Button>
      </Hint>
      <ConfirmAction
        open={open}
        title={title}
        consequence={consequence}
        confirmLabel={confirmLabel}
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          onConfirm();
        }}
      />
    </>
  );
}
