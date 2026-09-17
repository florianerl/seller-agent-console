import Alert from "@mui/material/Alert";

/**
 * Shown on screens whose reads are not side-effect free on the server.
 *
 * Several of the agent's GET routes still write — lazy expiry, mostly. An
 * operator watching records change while they browse deserves to know why.
 */
export function WritesNotice({ what }: { what: string }) {
  return (
    <Alert severity="info" variant="outlined" sx={{ mb: 2 }} data-note="writes">
      Opening this screen makes the agent write. {what} That GET is not
      read-only on the server, even when this console's write switch is off.
    </Alert>
  );
}
