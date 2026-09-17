import { useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { probe, type ProbeResult } from "../api/probe";
import { PageHeader } from "../components/PageHeader";
import { useCredential } from "../credentials/context";

export function SetupForm() {
  const { signIn } = useCredential();
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState<Extract<ProbeResult, { ok: false }> | undefined>();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setChecking(true);
    setFailure(undefined);

    const result = await probe(baseUrl, apiKey);
    setChecking(false);

    if (!result.ok) {
      setFailure(result);
      return;
    }

    await signIn({
      baseUrl: baseUrl.trim().replace(/\/+$/, ""),
      apiKey,
      role: result.role,
      name: result.name,
      reportedVersion: result.reportedVersion,
    });
  }

  return (
    <Box sx={{ maxWidth: 560 }}>
      <PageHeader
        eyebrow="Operator console"
        title="Connect to your seller agent"
        subtitle="This console talks to the agent's API from this browser. Writes stay off until you enable them for this key."
      />

      <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 3.5 } }}>
        {/* The handler is async; a form's onSubmit wants void. Left bare, a
              rejection escapes as an unhandled promise rather than reaching the
              form's own error state. */}
        <form
          onSubmit={(event) => {
            void onSubmit(event);
          }}
          noValidate
        >
          <Stack spacing={2.5}>
            <TextField
              label="Agent address"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://agent.example.com"
              required
              fullWidth
              autoComplete="url"
              slotProps={{ htmlInput: { "aria-describedby": "agent-address-help" } }}
              helperText="The origin only — no path."
              id="agent-address"
            />
            <TextField
              label="Operator API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
              fullWidth
              type="password"
              autoComplete="off"
              spellCheck={false}
              id="api-key"
              helperText="Stored in this browser only. Use a key minted for this console."
            />

            {failure && (
              <Alert severity="error" data-probe-step={failure.step}>
                <AlertTitle>{failure.message}</AlertTitle>
                {failure.hint && <Typography variant="body2">{failure.hint}</Typography>}
              </Alert>
            )}

            <Box>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={checking}
                startIcon={
                  checking ? <CircularProgress size={16} color="inherit" /> : undefined
                }
              >
                {checking ? "Checking…" : "Connect"}
              </Button>
            </Box>
          </Stack>
        </form>
      </Paper>

      <Alert severity="warning" variant="outlined" sx={{ mt: 3 }}>
        <AlertTitle>About the key you paste here</AlertTitle>
        <Typography variant="body2">
          An operator key carries full write authority on your agent. This console
          will not send writes until you enable them for this key, under the
          connection menu. Anything running in this browser can read the key. Use
          a dedicated key and revoke it if the device is lost.
        </Typography>
      </Alert>
    </Box>
  );
}
