import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Typography from "@mui/material/Typography";

/**
 * Shown where a screen needs the operator role and the stored key is a buyer
 * key. A bare 403 tells an operator nothing they can act on; naming the cause
 * and the fix does.
 */
export function GatedNotice({ what }: { what: string }) {
  return (
    <Alert severity="info" variant="outlined" data-state="operator-required">
      <AlertTitle sx={{ fontSize: 14, fontWeight: 600 }}>
        This screen needs an operator key
      </AlertTitle>
      <Typography variant="body2">
        {what} is only readable with the operator role. The key this console is
        using is a buyer key, so the agent refuses the request. Sign out and
        connect with an operator key to see it.
      </Typography>
    </Alert>
  );
}
