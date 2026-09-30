import { useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { describe, type Result } from "../api/errors";
import { palette } from "../theme/palette";
import { ConfirmAction } from "./ConfirmAction";
import { Hint } from "./Hint";

const formRowSx = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-end",
  columnGap: 1.5,
  rowGap: 1.5,
  "& .MuiFormControl-root": { minWidth: 160 },
} as const;

/**
 * Labeled fields are taller than the control. Pin actions to the input edge
 * so a wrap does not leave the button floating mid-label.
 */
export function FormRow({ children }: { children: ReactNode }) {
  return <Box sx={formRowSx}>{children}</Box>;
}

/** Lets sibling fields share a FormRow (and WriteForm's action) as one wrap. */
export function FormFields({ children }: { children: ReactNode }) {
  return <Box sx={{ display: "contents" }}>{children}</Box>;
}

/**
 * The shared shape of a mutation call site: fields, a disabled control while
 * writes are off, a confirmation that has to name the consequence, and the
 * outcome in place. Per-endpoint answers to idempotency stay in `consequence`.
 */
export function WriteForm({
  title,
  consequence,
  confirmLabel,
  action,
  blocked,
  pending,
  last,
  onConfirm,
  hint,
  variant = "outlined",
  color = "primary",
  children,
}: {
  title: string;
  consequence: ReactNode;
  confirmLabel: string;
  action: string;
  blocked: boolean;
  pending: boolean;
  last: Result<unknown> | undefined;
  onConfirm: () => void;
  /** Tooltip on the button. Only for what the label and the confirmation do not already say. */
  hint?: ReactNode;
  /**
   * The button's weight. Outlined is the default everywhere; a screen that
   * offers one obvious next move among several can make that one contained
   * and the rest quieter, so the choice reads before the labels do.
   */
  variant?: "contained" | "outlined" | "text";
  color?: "primary" | "inherit";
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const tip = blocked
    ? "Writes are switched off. Turn them on from the connection menu to use this."
    : hint;

  const actionButton = (
    <Hint hint={tip}>
      <Button
        variant={variant}
        color={color}
        size="small"
        data-action={action}
        disabled={blocked || pending}
        onClick={() => setOpen(true)}
        sx={{ flexShrink: 0 }}
      >
        {pending ? "Working…" : confirmLabel}
      </Button>
    </Hint>
  );

  return (
    <Box
      sx={
        children
          ? { display: "block" }
          : { display: "inline-flex", flexDirection: "column", alignItems: "flex-start" }
      }
      data-block={`write:${action}`}
    >
      {children ? (
        <FormRow>
          {children}
          {actionButton}
        </FormRow>
      ) : (
        actionButton
      )}
      {last && last.kind !== "ok" && (
        <Typography variant="body2" sx={{ mt: 1, color: palette.error }} data-state="write-failed">
          {describe(last)}
        </Typography>
      )}
      {last?.kind === "ok" && (
        <Typography variant="body2" sx={{ mt: 1 }} data-state="write-ok">
          The agent accepted this call.
        </Typography>
      )}
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
    </Box>
  );
}

/**
 * The read counterpart of `WriteForm`: a button that runs straight away. A read
 * has nothing to warn about, and a dialog in front of it teaches people to
 * click through the ones that matter. A GET that writes upstream (`fetch-deal`
 * and its lazy expiry) is not a read for this purpose and stays on `WriteForm`.
 */
export function ReadForm({
  label,
  action,
  disabled = false,
  onRun,
  children,
}: {
  label: string;
  action: string;
  disabled?: boolean;
  onRun: () => void;
  children?: ReactNode;
}) {
  const button = (
    <Button
      variant="outlined"
      size="small"
      data-action={action}
      disabled={disabled}
      onClick={onRun}
      sx={{ flexShrink: 0 }}
    >
      {label}
    </Button>
  );
  return children ? (
    <FormRow>
      {children}
      {button}
    </FormRow>
  ) : (
    button
  );
}
