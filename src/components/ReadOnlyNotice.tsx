import Alert from "@mui/material/Alert";

/**
 * Shown on a screen that owns mutations while the write switch is off.
 *
 * The counterpart of WritesNotice, and deliberately its mirror: that one says
 * the server writes when we only read, this one says we will not write even
 * though the controls exist. Both exist so nothing about what this console
 * does has to be inferred from whether a button happens to be greyed out.
 */
export function ReadOnlyNotice({ what }: { what: string }) {
  return (
    <Alert severity="info" variant="outlined" sx={{ mb: 2.5 }} data-note="read-only">
      This console is read-only. {what} is disabled until writes are enabled for
      this key, under the connection menu.
    </Alert>
  );
}
