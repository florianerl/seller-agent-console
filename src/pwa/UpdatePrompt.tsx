import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import { useState } from "react";
import { useServiceWorker } from "./useServiceWorker";

/**
 * Offers the update rather than applying it. Persistent (no autoHideDuration):
 * a notice that disappears on its own is one an operator will miss, and the
 * app keeps working on the old build until they choose.
 */
export function UpdatePrompt() {
  const { updateReady, applyUpdate } = useServiceWorker();
  const [dismissed, setDismissed] = useState(false);

  return (
    <Snackbar
      open={updateReady && !dismissed}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      sx={{ mb: "env(safe-area-inset-bottom)" }}
    >
      <Alert
        severity="info"
        variant="filled"
        data-update-prompt="ready"
        action={
          <>
            <Button color="inherit" size="small" onClick={applyUpdate}>
              Reload
            </Button>
            <Button color="inherit" size="small" onClick={() => setDismissed(true)}>
              Later
            </Button>
          </>
        }
      >
        A new version is available
      </Alert>
    </Snackbar>
  );
}
