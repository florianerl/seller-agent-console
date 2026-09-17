import { useEffect, useState, useSyncExternalStore } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import { getAgentUnreachable, subscribeReachability } from "../query/reachability";

function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}

/**
 * Two signals, two messages. Conflating them produces a banner that lies:
 * navigator.onLine is true behind a captive portal, and a browser with perfect
 * connectivity can still be unable to reach one particular agent.
 */
export function ConnectivityBanner() {
  const online = useOnline();
  const agentUnreachable = useSyncExternalStore(
    subscribeReachability,
    getAgentUnreachable,
    () => false,
  );

  if (!online) {
    return (
      <Box sx={{ mb: 2 }}>
        <Alert severity="warning" variant="outlined" data-banner="offline">
          No network connection. Values below are the last ones this device saw.
        </Alert>
      </Box>
    );
  }

  // Only worth saying once several resources agree; a single failing endpoint
  // is the card's business, not the shell's.
  if (agentUnreachable) {
    return (
      <Box sx={{ mb: 2 }}>
        <Alert severity="warning" variant="outlined" data-banner="unreachable">
          Can't reach the seller agent. Showing the last values received.
        </Alert>
      </Box>
    );
  }

  return null;
}
