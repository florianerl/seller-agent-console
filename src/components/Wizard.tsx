import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import Typography from "@mui/material/Typography";
import { palette } from "../theme/palette";

/**
 * The frame every create-something wizard shares: a dialog, a stepper, Back
 * and Next, and a last step whose button does the write. The last step is a
 * review that names what the agent will do, which is why a wizard needs no
 * separate confirmation dialog — the review *is* the confirmation, and a
 * dialog over this dialog would only ask the same question twice.
 *
 * Extracted when the second wizard (orders, after deals) arrived, so the two
 * cannot drift into different button orders or step behaviour.
 */
export function WizardDialog({
  open,
  title,
  steps,
  step,
  onStep,
  onClose,
  canNext,
  finishLabel,
  pendingLabel,
  onFinish,
  canFinish,
  pending,
  done,
  doneActions,
  block,
  children,
}: {
  open: boolean;
  title: string;
  steps: readonly string[];
  step: number;
  onStep: (step: number) => void;
  onClose: () => void;
  /** Whether the current, non-final step is complete enough to move on. */
  canNext: boolean;
  finishLabel: string;
  pendingLabel: string;
  onFinish: () => void;
  /** Writes on, inputs valid: whether the final button may be pressed. */
  canFinish: boolean;
  pending: boolean;
  /** The write landed; the footer switches to `doneActions`. */
  done: boolean;
  /** Replaces the footer once done. Defaults to a single Done button. */
  doneActions?: ReactNode;
  block: string;
  children: ReactNode;
}) {
  const last = steps.length - 1;
  return (
    <Dialog open={open} onClose={pending ? undefined : onClose} fullWidth maxWidth="sm" data-block={block}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stepper activeStep={step} sx={{ mb: 3, mt: 0.5 }}>
          {steps.map((label, index) => (
            <Step key={label} completed={done || index < step}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
        {children}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {done ? (
          (doneActions ?? (
            <Button variant="contained" onClick={onClose} data-action="wizard-done">
              Done
            </Button>
          ))
        ) : (
          <>
            <Button onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Box sx={{ flex: 1 }} />
            {step > 0 && (
              <Button onClick={() => onStep(step - 1)} disabled={pending}>
                Back
              </Button>
            )}
            {step < last ? (
              <Button
                variant="contained"
                onClick={() => onStep(step + 1)}
                disabled={!canNext}
                data-action="wizard-next"
              >
                Next
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={onFinish}
                disabled={!canFinish || pending}
                data-action="wizard-create"
              >
                {pending ? pendingLabel : finishLabel}
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

/** The first step: one route per card, picked by what the operator holds. */
export function ChoiceCards<V extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: V;
  onChange: (value: V) => void;
  options: readonly { value: V; title: string; description: string }[];
  /** Names the group for assistive technology. */
  label: string;
}) {
  return (
    <RadioGroup value={value} onChange={(e) => onChange(e.target.value as V)} aria-label={label} sx={{ gap: 1 }}>
      {options.map((m) => (
        <Box
          key={m.value}
          sx={{
            border: `1px solid ${value === m.value ? palette.brandRedText : palette.line}`,
            borderRadius: 1,
            px: 1.5,
            py: 0.5,
          }}
        >
          <FormControlLabel
            value={m.value}
            control={<Radio size="small" />}
            sx={{ alignItems: "flex-start", m: 0, width: "100%" }}
            label={
              <Box sx={{ pt: 0.75 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {m.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" component="p">
                  {m.description}
                </Typography>
              </Box>
            }
          />
        </Box>
      ))}
    </RadioGroup>
  );
}

/** The review step's facts, as a definition list: what will be sent. */
export function ReviewList({ rows }: { rows: readonly (readonly [string, ReactNode])[] }) {
  return (
    <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 2, rowGap: 0.5 }}>
      {rows.map(([k, v]) => (
        <Box key={k} sx={{ display: "contents" }}>
          <Typography component="dt" variant="body2" color="text.secondary">
            {k}
          </Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, fontFamily: "monospace", wordBreak: "break-all" }}>
            {v}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
