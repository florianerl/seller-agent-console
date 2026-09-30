import type { ReactElement, ReactNode } from "react";
import Tooltip from "@mui/material/Tooltip";

/**
 * A tooltip that also works on a disabled control. MUI does not fire pointer
 * events on a disabled button, so the hint would never show on exactly the
 * control an operator is wondering about — hence the wrapping span.
 *
 * The wrapper is always rendered, even with no hint: a hint that comes and
 * goes (the writes-off message clears once a form is fillable) must not change
 * the tree, or the control remounts under the operator's cursor. An empty
 * title makes MUI show nothing.
 *
 * `describeChild`: by default MUI copies the tip into `aria-label` on the
 * wrapper, which gives a non-interactive span an accessible name that repeats
 * the field's own words and makes a label query match twice. As a description
 * it is announced after the control's real label instead.
 *
 * `describeChild`: by default MUI copies the tip into `aria-label` on the
 * wrapper, which gives a non-interactive span an accessible name that repeats
 * the field's own words and makes a label query match twice. As a description
 * it is announced after the control's real label instead.
 */
export function Hint({
  hint,
  children,
  block,
}: {
  hint?: ReactNode;
  children: ReactElement;
  /** Fill the parent's width — for a field in a grid, not a button in a row. */
  block?: boolean | undefined;
}) {
  return (
    <Tooltip title={hint ?? ""} describeChild enterDelay={400} placement="top-start" arrow>
      <span style={{ display: block ? "block" : "inline-block" }}>{children}</span>
    </Tooltip>
  );
}
