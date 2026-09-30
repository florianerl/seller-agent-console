import { useId, type ReactNode } from "react";
import TextField, { type TextFieldProps } from "@mui/material/TextField";
import { Hint } from "./Hint";

/** Hidden from sight, not from assistive tech — the usual clip recipe. */
const VISUALLY_HIDDEN = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

/**
 * A `TextField` that says what it does or expects. The hint is a tooltip, not
 * helper text, so a dense form keeps its shape.
 *
 * The tooltip is a pointer affordance and lives on `Hint`'s wrapping span, so
 * on its own it never reaches the control: a screen reader focusing the input
 * would not hear it. The hint is therefore also rendered visually hidden and
 * joined to the input's `aria-describedby`, next to the helper text MUI wires
 * up. It is a description, never a name — as an `aria-label` it made "Agent
 * address" match two elements and put a prohibited attribute on a bare span.
 */
export function TipField({
  hint,
  fullWidth,
  id,
  helperText,
  select,
  slotProps,
  inputProps,
  SelectProps,
  ...rest
}: TextFieldProps & { hint?: ReactNode }) {
  const autoId = useId();
  // Resolved here, not left to MUI, because the helper-text id derives from it.
  const fieldId = id ?? autoId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const describedBy =
    [helperText ? `${fieldId}-helper-text` : undefined, hintId].filter(Boolean).join(" ") ||
    undefined;

  // A select's focusable element is the combobox div, not the hidden native
  // input, so its description goes through the select slot. MUI lets a slot
  // prop replace its legacy twin wholesale, and Autocomplete's `renderInput`
  // params still arrive as legacy `inputProps` (value, ref, handlers), so the
  // twin is folded in here rather than silently dropped.
  const own = { "aria-describedby": describedBy };
  const slot = select ? "select" : "htmlInput";
  const legacy = select ? SelectProps : inputProps;
  const theirs = slotProps?.[slot];
  const merged = {
    ...slotProps,
    [slot]: { ...own, ...legacy, ...(typeof theirs === "object" ? theirs : undefined) },
  };

  return (
    <Hint hint={hint} block={fullWidth}>
      <>
        <TextField
          fullWidth={fullWidth}
          id={fieldId}
          helperText={helperText}
          select={select}
          slotProps={merged}
          {...rest}
        />
        {hintId && (
          <span id={hintId} style={VISUALLY_HIDDEN}>
            {hint}
          </span>
        )}
      </>
    </Hint>
  );
}
