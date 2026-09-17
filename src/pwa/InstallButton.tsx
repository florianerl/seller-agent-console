import { useEffect, useState, useSyncExternalStore } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import {
  getInstallState,
  isAlreadyInstalled,
  isIosSafari,
  isStandalone,
  promptInstall,
  subscribeInstall,
  type InstallState,
} from "./install";

const SERVER_STATE: InstallState = { canPrompt: false, installed: false };

type Help = "ios" | "open" | undefined;

/**
 * The install affordance, in the app's own chrome.
 *
 * Chrome already puts an install icon in the omnibox, so this is not the only
 * route — but that icon is small, easy to miss, gone once Android's infobar is
 * dismissed, and absent entirely on iOS. An operator console is exactly the
 * kind of thing someone wants on a home screen, so it is worth asking plainly.
 *
 * Three states, because they need different things said:
 *   - installable here: prompt for real
 *   - iOS: no programmatic prompt exists, so explain where the control is
 *   - installed already, viewed in a tab: no web API can launch it, so say so
 */
export function InstallButton() {
  const state = useSyncExternalStore(subscribeInstall, getInstallState, () => SERVER_STATE);
  const [help, setHelp] = useState<Help>(undefined);
  const [declined, setDeclined] = useState(false);
  const [alreadyInstalled, setAlreadyInstalled] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void isAlreadyInstalled().then((answer) => {
      if (!cancelled) setAlreadyInstalled(answer);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dialog = (
    <Dialog open={help !== undefined} onClose={() => setHelp(undefined)}>
      {help === "ios" ? (
        <>
          <DialogTitle>Add to your home screen</DialogTitle>
          <DialogContent>
            <DialogContentText data-help="ios-install">
              iOS does not let a page start an install. Open the Share menu, then
              choose <strong>Add to Home Screen</strong>. The console then opens
              in its own window and keeps working offline for what it has
              already loaded.
            </DialogContentText>
          </DialogContent>
        </>
      ) : (
        <>
          <DialogTitle>This console is already installed</DialogTitle>
          <DialogContent>
            {/* Said rather than faked. A page cannot launch its own installed
                app — no API exists — and a button that silently did nothing
                would be worse than this sentence. */}
            <DialogContentText data-help="open-in-app">
              A page cannot open an installed app, so this has to be done from
              the browser. In Chrome, use the <strong>Open in app</strong> item
              in the menu at the end of the address bar — or launch the console
              from your applications list or home screen, where it is installed
              as <strong>Seller Ops</strong>.
            </DialogContentText>
          </DialogContent>
        </>
      )}
      <DialogActions>
        <Button onClick={() => setHelp(undefined)}>Close</Button>
      </DialogActions>
    </Dialog>
  );

  // Running as the installed app: nothing to offer.
  if (state.installed || isStandalone()) return null;

  // Installed, but being viewed in a tab.
  if (alreadyInstalled === true) {
    return (
      <>
        <Button
          color="inherit"
          size="small"
          data-action="open-in-app"
          sx={{ fontSize: 13, fontWeight: 600, mr: 0.5 }}
          onClick={() => setHelp("open")}
        >
          Open in app
        </Button>
        {dialog}
      </>
    );
  }

  const ios = isIosSafari();
  if (!state.canPrompt && !ios) return null;
  // Asked once and told no. Chrome's omnibox icon stays for anyone who changes
  // their mind; nagging in the app's own chrome would not be an improvement.
  if (declined) return null;

  return (
    <>
      <Button
        color="inherit"
        size="small"
        data-action="install"
          sx={{ fontSize: 13, fontWeight: 600, mr: 0.5 }}
        onClick={() => {
          if (ios) {
            setHelp("ios");
            return;
          }
          void promptInstall().then((outcome) => {
            if (outcome === "dismissed") setDeclined(true);
          });
        }}
      >
        Install
      </Button>
      {dialog}
    </>
  );
}
