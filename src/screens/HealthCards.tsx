import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import {
  agentCard,
  apiKeys,
  events,
  health,
  inventorySyncStatus,
  root,
  supplyChain,
} from "../api/endpoints";
import { StatusCard } from "../components/StatusCard";
import { stamp } from "../lib/time";
import { useCredential } from "../credentials/context";
import { CADENCE } from "../query/cadence";
import { useResource } from "../query/useResource";

/** "never" rather than an em dash: an unsynced agent has a meaning, not a gap. */
function when(iso: string | null | undefined): string {
  return iso ? stamp(iso) : "never";
}

export function HealthCards() {
  const { credential } = useCredential();

  const agent = useResource("health", health, { refreshInterval: CADENCE.health });
  const identity = useResource("root", root, { refreshInterval: CADENCE.health });
  const access = useResource("api-keys", apiKeys, { refreshInterval: CADENCE.health });
  const sync = useResource("inventory-sync", inventorySyncStatus, {
    refreshInterval: CADENCE.inventorySync,
  });
  const chain = useResource("supply-chain", supplyChain, {
    refreshInterval: CADENCE.supplyChain,
  });
  const card = useResource("agent-card", agentCard, { refreshInterval: CADENCE.agentCard });
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

      <StatusCard title="Supply chain" testId="supply-chain" resource={chain}>
        {(data) => (
          <>
            <Typography sx={{ fontSize: 15, fontWeight: 600 }}>
              {data.is_direct ? "Direct seller" : "Intermediary"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {data.seller_id}
              {data.domain ? ` · ${data.domain}` : ""}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {/* The chain is what a buyer verifies against sellers.json. A
                  count with no length is the one number worth showing here;
                  the nodes themselves belong on a screen with room. */}
              {data.schain.length} node{data.schain.length === 1 ? "" : "s"} declared
            </Typography>
          </>
        )}
      </StatusCard>

      <StatusCard title="Advertised card" testId="agent-card" resource={card}>
        {(data) => (
          <>
            <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{data.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              {/* What the agent tells other agents about itself, which is
                  routinely wrong behind a proxy — it hardcodes localhost in the
                  deployment this was written against. Never presented as the
                  address this console is talking to. */}
              claims {data.url ?? "no address"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {data.skills.length} skill{data.skills.length === 1 ? "" : "s"}
              {data.capabilities?.protocols.length
                ? ` · ${data.capabilities.protocols.join(", ")}`
                : ""}
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
