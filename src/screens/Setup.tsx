import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { useCredential } from "../credentials/context";
import { SetupForm } from "./SetupForm";
import { HealthCards } from "./HealthCards";

export default function SetupScreen() {
  const { credential, loading } = useCredential();

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress size={28} aria-label="Loading saved connection" />
      </Box>
    );
  }

  if (!credential) {
    return (
      <section data-screen="setup" data-state="unconfigured">
        <SetupForm />
      </section>
    );
  }

  return (
    <section data-screen="setup" data-state="configured">
      <Typography variant="h2" sx={{ fontSize: 20, fontWeight: 600, mb: 1 }}>
        Setup and health
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {credential.baseUrl} · signed in as {credential.role}
      </Typography>
      <HealthCards />
    </section>
  );
}
