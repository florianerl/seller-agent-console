import Alert from "@mui/material/Alert";

/**
 * Shown on screens whose reads are not side-effect free on the server.
 *
 * "Read-only" here means this console issues no unsafe HTTP methods. Several
 * of the agent's GET routes still write — lazy expiry, mostly. Claiming the
 * stronger thing would be false, and an operator watching records change while
 * they browse deserves to know why rather than to suspect the console.
 */
export function WritesNotice({ what }: { what: string }) {
  return (
    <Alert severity="info" variant="outlined" sx={{ mb: 2 }} data-note="writes">
      Opening this screen makes the agent write. {what} This console sends no
      unsafe methods, but that GET is not read-only on the server.
    </Alert>
  );
}
