import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { apiKeys, events, health, inventorySyncStatus, root } from "../api/endpoints";
import { StatusCard } from "../components/StatusCard";
import { useCredential } from "../credentials/context";
import { CADENCE } from "../query/cadence";
import { useResource } from "../query/useResource";

function when(iso: string | null | undefined): string {
  if (!iso) return "never";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(at);
}

export function HealthCards() {
  const { credential } = useCredential();

  const agent = useResource("health", health, { refreshInterval: CADENCE.health });
  const identity = useResource("root", root, { refreshInterval: CADENCE.health });
  const access = useResource("api-keys", apiKeys, { refreshInterval: CADENCE.health });
  const sync = useResource("inventory-sync", inventorySyncStatus, {
    refreshInterval: CADENCE.inventorySync,
  });
  const lastEvent = useResource(
    "last-event",
    (connection, signal) => events(connection, { limit: 1 }, signal),
    { refreshInterval: CADENCE.events },
  );

  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(4, 1fr)" },
      }}
    >
      <StatusCard title="Agent" testId="agent" resource={agent}>
        {(data) => (
          <>
            <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{data.status}</Typography>
            <Typography variant="body2" color="text.secondary">
              {identity.data?.name ?? "—"}
            </Typography>
            {identity.data && (
              <Typography variant="body2" color="text.secondary">
                {/* Upstream hardcodes this literal and it has already drifted
                    from the app's declared version, so never call it "version". */}
                reported version {identity.data.version}
              </Typography>
            )}
          </>
        )}
      </StatusCard>

      <StatusCard title="Console access" testId="access" resource={access}>
        {() => (
          <>
            <Typography sx={{ fontSize: 15, fontWeight: 600 }}>
              {credential?.role === "operator" ? "Operator" : "Buyer"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              key accepted
            </Typography>
          </>
        )}
      </StatusCard>

      <StatusCard title="Inventory sync" testId="sync" resource={sync}>
        {(data) => (
          <>
            <Typography sx={{ fontSize: 15, fontWeight: 600 }}>
              {data.enabled ? "Enabled" : "Disabled"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              last run {when(data.last_sync)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {data.sync_count} run{data.sync_count === 1 ? "" : "s"}
              {data.task_running ? " · running now" : ""}
            </Typography>
          </>
        )}
      </StatusCard>

      <StatusCard title="Event bus" testId="events" resource={lastEvent}>
        {(data) => {
          const latest = data.events[0];
          if (!latest) {
            return <Typography sx={{ fontSize: 15 }}>no events yet</Typography>;
          }
          return (
            <>
              <Typography sx={{ fontSize: 15, fontWeight: 600 }}>
                {latest.event_type}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {when(latest.timestamp)}
              </Typography>
            </>
          );
        }}
      </StatusCard>
    </Box>
  );
}
