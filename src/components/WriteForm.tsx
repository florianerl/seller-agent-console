import { useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { describe, type Result } from "../api/errors";
import { palette } from "../theme/palette";
import { ConfirmAction } from "./ConfirmAction";

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
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Box sx={{ mt: 1.5 }} data-block={`write:${action}`}>
      {children}
      <Button
        size="small"
        variant="outlined"
        data-action={action}
        disabled={blocked || pending}
        onClick={() => setOpen(true)}
        sx={{ mt: children ? 1 : 0 }}
      >
        {pending ? "Working…" : confirmLabel}
      </Button>
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
