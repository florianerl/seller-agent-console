import type { ReactNode } from "react";
import TextField, { type TextFieldProps } from "@mui/material/TextField";
import { Hint } from "./Hint";

/**
 * A `TextField` that says what it does or expects. The hint is a tooltip, not
 * helper text, so a dense form keeps its shape; it also lands in `aria-label`
 * -adjacent territory via MUI's Tooltip, which wires `aria-label` to the string.
 */
export function TipField({ hint, fullWidth, ...rest }: TextFieldProps & { hint?: ReactNode }) {
  return (
    <Hint hint={hint} block={fullWidth}>
      <TextField fullWidth={fullWidth} {...rest} />
    </Hint>
  );
}
