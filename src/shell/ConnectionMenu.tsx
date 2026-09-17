import type React from "react";
import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
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
 *
 * The write switch lives here too, next to the key it applies to. Turning it
 * on asks first; turning it off does not — restraint never needs confirming.
 */
export function ConnectionMenu() {
  const { credential, signOut, writesEnabled, setWritesEnabled } = useCredential();
  const [confirming, setConfirming] = useState(false);
  const [confirmingWrites, setConfirmingWrites] = useState(false);

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
        <FormControlLabel
          sx={{ mr: 0, "& .MuiFormControlLabel-label": { fontSize: 12 } }}
          label="Writes"
          control={
            <Switch
              size="small"
              color="default"
              checked={writesEnabled}
              // MUI 7 routes attributes to the real <input> through slotProps;
              // inputProps silently drops them, taking the accessible name
              // with it.
              slotProps={{
                input: {
                  "aria-label": "Enable write operations",
                  "data-control": "writes-toggle",
                } as React.InputHTMLAttributes<HTMLInputElement>,
              }}
              onChange={(event) => {
                // Enabling asks; disabling takes effect at once, because the
                // safe direction should never be the one with a dialog in it.
                if (event.target.checked) setConfirmingWrites(true);
                else void setWritesEnabled(false);
              }}
            />
          }
        />
        <Button
          color="inherit"
          size="small"
          onClick={() => setConfirming(true)}
          sx={{ fontSize: 12 }}
        >
          Sign out
        </Button>
      </Box>

      <Dialog open={confirmingWrites} onClose={() => setConfirmingWrites(false)}>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 600 }}>
          Enable writes with this key?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: 14 }}>
            {/* The blast radius, in the words ADR 11 used for it. An operator
                deciding this deserves the real number, not a reassurance. */}
            This console will be able to change what the agent holds — deciding
            approvals, transitioning orders, rewriting the rate card, minting
            keys. The key stored here carries that authority whether or not this
            switch is on; what the switch decides is whether a mistake in this
            browser can use it. Turn it off again when you are done.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmingWrites(false)}>Cancel</Button>
          <Button
            variant="contained"
            data-action="confirm-enable-writes"
            onClick={() => {
              setConfirmingWrites(false);
              void setWritesEnabled(true);
            }}
          >
            Enable writes
          </Button>
        </DialogActions>
      </Dialog>

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
