import { useState } from "react";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { agents } from "../api/endpoints";
import { describe } from "../api/errors";
import { DataPanel, FreshnessNote } from "../components/DataPanel";
import { PageHeader } from "../components/PageHeader";
import { StatusChip } from "../components/StatusChip";
import { ReadOnlyNotice } from "../components/ReadOnlyNotice";
import { useCredential } from "../credentials/context";
import { FormRow } from "../components/WriteForm";
import { AgentDetailLookup, AgentWrites, Panel } from "./mutations";
import { plural, stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";

const TRUST = ["", "unknown", "registered", "approved", "preferred", "blocked"];
const TYPES = ["", "buyer", "seller", "tool_provider", "data_provider", "other"];

export default function AgentsScreen() {
  const [trust, setTrust] = useState("");
  const [type, setType] = useState("");
  const { writesEnabled } = useCredential();

  const list = useResource(
    `agents:${trust}:${type}`,
    (c, signal) =>
      agents(
        c,
        { ...(trust ? { trust_status: trust } : {}), ...(type ? { agent_type: type } : {}) },
        signal,
      ),
    { refreshInterval: CADENCE.rateCard },
  );

  const rows = list.data?.agents ?? [];

  return (
    <section data-screen="agents">
      <PageHeader
        title="Agents"
        subtitle="Buyer and partner agents this seller has seen. Trust changes are writes."
      >

      {!writesEnabled && <ReadOnlyNotice what="Discovering or changing trust" />}
      <Panel title="Registry writes">
        <AgentWrites />
        <AgentDetailLookup />
      </Panel>

      <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }}>
        <FormRow>
          <TextField
            select
            size="small"
            label="Trust"
            value={trust}
            onChange={(e) => setTrust(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            {TRUST.map((t) => (
              <MenuItem key={t || "any"} value={t}>
                {t || "Any trust status"}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            {TYPES.map((t) => (
              <MenuItem key={t || "any"} value={t}>
                {t ? t.replace(/_/g, " ") : "Any type"}
              </MenuItem>
            ))}
          </TextField>
        </FormRow>
      </Paper>

      <FreshnessNote freshness={list.freshness}>
        {list.freshness === "live" && plural(list.data?.total ?? rows.length, "agent")}
        {list.freshness === "stale" && "couldn't refresh — showing the last list received"}
        {list.freshness === "empty" &&
          (list.loading ? "loading…" : list.result ? describe(list.result) : "")}
      </FreshnessNote>

      <DataPanel>
        {list.loading && rows.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Skeleton height={28} />
          </Box>
        ) : rows.length === 0 ? (
          <Box sx={{ p: 3 }} data-state="empty">
            <Typography variant="body2" color="text.secondary">
              {list.freshness === "empty" && list.result?.kind === "unavailable"
                ? describe(list.result)
                : trust || type
                  ? "No agents match these filters."
                  : "No agents have registered yet."}
            </Typography>
          </Box>
        ) : (
          <Table size="small" data-state="rows">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Agent</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Trust (set here)</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Registry (verified elsewhere)</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Last seen</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((agent) => {
                const verified = agent.registry_sources.filter((s) => s.verified_at);
                return (
                  <TableRow key={agent.agent_id} hover data-row="agent">
                    <TableCell>
                      {/* An agent that never served a card has no name, and
                          printing its id twice looks like a rendering fault
                          rather than an absence. */}
                      {agent.agent_card?.name ? (
                        <>
                          <Box sx={{ fontSize: 13 }}>{agent.agent_card.name}</Box>
                          <Box
                            sx={{
                              fontFamily: "monospace",
                              fontSize: 11,
                              color: palette.textSecondary,
                            }}
                          >
                            {agent.agent_id}
                          </Box>
                        </>
                      ) : (
                        <Box sx={{ fontFamily: "monospace", fontSize: 12 }}>{agent.agent_id}</Box>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12 }}>
                      {agent.agent_type.replace(/_/g, " ")}
                    </TableCell>
                    {/* Two different kinds of claim, kept in separate columns.
                        trust_status is this operator's own decision about the
                        agent; a registry source is an external registry saying
                        it verified them. Collapsing both into one "verified"
                        badge would let our own judgement borrow someone else's
                        authority, or the reverse. */}
                    <TableCell>
                      <StatusChip status={agent.trust_status} />
                    </TableCell>
                    <TableCell sx={{ fontSize: 12 }} data-cell="registry">
                      {verified.length === 0 ? (
                        <Box component="span" sx={{ color: palette.textSecondary }}>
                          not in any registry
                        </Box>
                      ) : (
                        verified
                          .map((s) => `${s.registry_name || s.registry_id} (${stamp(s.verified_at)})`)
                          .join(", ")
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                      {stamp(agent.last_seen)}
                      {agent.interaction_count > 0 && ` · ${agent.interaction_count} interactions`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DataPanel>
      </PageHeader>
    </section>
  );
}
