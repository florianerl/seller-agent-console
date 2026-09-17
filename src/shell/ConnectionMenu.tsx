import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import { useCredential } from "../credentials/context";

/**
 * Who this console is connected as, and the way out.
 *
 * `signOut` has existed since the credential store was written and nothing
 * called it — while the gated-access notice told operators to "sign out and
 * connect with an operator key". The instruction was unfollowable, which is a
 * worse failure than the missing button: it sends someone hunting for a
 * control that is not there.
 */
export function ConnectionMenu() {
  const { credential, signOut } = useCredential();
  const [confirming, setConfirming] = useState(false);

  if (!credential) return null;

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Typography
          component="span"
          sx={{ fontSize: 12, opacity: 0.85, display: { xs: "none", sm: "inline" } }}
          data-connection="summary"
        >
          {credential.baseUrl} · {credential.role}
        </Typography>
        <Button
          color="inherit"
          size="small"
          onClick={() => setConfirming(true)}
          sx={{ fontSize: 12 }}
        >
          Sign out
        </Button>
      </Box>

      <Dialog open={confirming} onClose={() => setConfirming(false)}>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 600 }}>Sign out of this agent?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: 14 }}>
            {/* Said plainly, because the second half is the part people do not
                expect and the first half is the part they might rely on. */}
            This removes the stored key and every cached value from this browser.
            It does <strong>not</strong> revoke the key — anything else holding a
            copy can still use it. Revoke it on the agent if it may have leaked.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>Cancel</Button>
          <Button
            variant="contained"
            data-action="confirm-sign-out"
            onClick={() => {
              setConfirming(false);
              void signOut();
            }}
          >
            Sign out
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
