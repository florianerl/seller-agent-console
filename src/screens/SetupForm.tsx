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
      <Typography variant="h2" sx={{ fontSize: 20, fontWeight: 600, mb: 1 }}>
        Connect to your seller agent
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        This console reads from the agent's API. It never writes.
      </Typography>

      <Paper variant="outlined" sx={{ p: 3 }}>
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
              size="small"
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
              size="small"
              type="password"
              autoComplete="off"
              spellCheck={false}
              id="api-key"
              helperText="Stored in this browser only. Use a key minted for this console."
            />

            {failure && (
              <Alert severity="error" data-probe-step={failure.step}>
                <AlertTitle sx={{ fontSize: 14, fontWeight: 600 }}>
                  {failure.message}
                </AlertTitle>
                {failure.hint && (
                  <Typography variant="body2">{failure.hint}</Typography>
                )}
              </Alert>
            )}

            <Box>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={checking}
                startIcon={
                  checking ? <CircularProgress size={14} color="inherit" /> : undefined
                }
              >
                {checking ? "Checking…" : "Connect"}
              </Button>
            </Box>
          </Stack>
        </form>
      </Paper>

      <Alert severity="warning" variant="outlined" sx={{ mt: 3 }}>
        <AlertTitle sx={{ fontSize: 14, fontWeight: 600 }}>
          About the key you paste here
        </AlertTitle>
        <Typography variant="body2">
          An operator key carries full write authority on your agent. This console
          issues no writes, but that is a choice this application makes, not a
          restriction the key carries. Anything running in this browser can read it.
          Use a dedicated key and revoke it if the device is lost.
        </Typography>
      </Alert>
    </Box>
  );
}
