import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Typography from "@mui/material/Typography";
import type { Result } from "../api/errors";

/**
 * Shown where a screen's data came back `rejected`. The two rejections mean
 * opposite things and must not share a message: a 403 is a valid key without
 * the operator role, a 401 is a key the agent will not accept at all — expired,
 * revoked, or from another deployment. Telling someone holding a dead operator
 * key that they are "using a buyer key" sends them looking for the wrong
 * problem, which is exactly what this console did until a live key expired and
 * the screen confidently said the wrong thing.
 */
export function GatedNotice({
  what,
  result,
}: {
  what: string;
  /** The rejected result. Absent is treated as the insufficient-role case. */
  result?: Result<unknown> | undefined;
}) {
  const anonymous = result?.kind === "rejected" && result.role === "anonymous";

  if (anonymous) {
    return (
      <Alert severity="warning" variant="outlined" data-state="key-rejected">
        <AlertTitle>The agent rejected this key</AlertTitle>
        <Typography variant="body2">
          {what} could not be read because the agent refused the stored key. It has
          most likely expired or been revoked — or it belongs to a different
          deployment than the address this console is pointed at. Connect again
          with a current key.
        </Typography>
      </Alert>
    );
  }

  return (
    <Alert severity="info" variant="outlined" data-state="operator-required">
      <AlertTitle>This screen needs an operator key</AlertTitle>
      <Typography variant="body2">
        {what} is only readable with the operator role. The key this console is
        using is a buyer key, so the agent refuses the request. Sign out and
        connect with an operator key to see it.
      </Typography>
    </Alert>
  );
}
