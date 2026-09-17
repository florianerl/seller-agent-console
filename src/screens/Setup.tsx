import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { PageHeader } from "../components/PageHeader";
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
      <PageHeader
        title="Setup and health"
        subtitle={`${credential.baseUrl} · signed in as ${credential.role}`}
      >
        <HealthCards />
      </PageHeader>
    </section>
  );
}
