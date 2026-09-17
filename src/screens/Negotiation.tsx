import { Fragment, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { sessionById, sessions } from "../api/endpoints";
import { describe } from "../api/errors";
import { Field, FieldGrid } from "../components/Field";
import { StatusChip } from "../components/StatusChip";
import { WritesNotice } from "../components/WritesNotice";
import { plural, stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";

const STATUSES = ["", "active", "expired", "closed"];

function Conversation({ sessionId }: { sessionId: string }) {
  const detail = useResource(`session:${sessionId}`, (c, signal) =>
    sessionById(c, sessionId, signal),
  );

  if (detail.loading && !detail.data) return <Skeleton height={24} />;
  if (!detail.data) {
    return (
      <Typography variant="body2" color="text.secondary">
        {detail.result ? describe(detail.result) : "no detail"}
      </Typography>
    );
  }

  const { messages, linked_flow_ids, expires_at } = detail.data;

  return (
    <Stack spacing={2} sx={{ py: 1 }}>
      <FieldGrid data-block="session-detail">
        <Field label="Expires">{stamp(expires_at)}</Field>
        <Field label="Messages">{messages.length.toLocaleString()}</Field>
        <Field label="Linked flows">{linked_flow_ids.length || "—"}</Field>
      </FieldGrid>

      <Box>
        <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 0.5 }}>Conversation</Typography>
        {messages.length === 0 ? (
          <Typography variant="body2" color="text.secondary" data-state="no-messages">
            No messages recorded on this session.
          </Typography>
        ) : (
          <Box
            component="ol"
            data-list="messages"
            sx={{ m: 0, pl: 0, listStyle: "none", maxHeight: 360, overflow: "auto" }}
          >
            {messages.map((message, index) => {
              const row = message as Record<string, unknown>;
              const role = typeof row["role"] === "string" ? row["role"] : "unknown";
              const at = typeof row["timestamp"] === "string" ? row["timestamp"] : null;
              return (
                <Box
                  component="li"
                  key={typeof row["message_id"] === "string" ? row["message_id"] : index}
                  sx={{ py: 0.75, borderTop: index === 0 ? "none" : `1px solid ${palette.line}` }}
                >
                  <Box sx={{ fontSize: 12, color: palette.textSecondary }}>
                    {role} · {stamp(at)}
                  </Box>
                  {/* Message payloads differ per role and the schema is open,
                      so the body is shown as it arrived rather than mapped
                      into fields that may not exist. */}
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      mt: 0.5,
                      fontSize: 12,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {JSON.stringify(row["content"] ?? row, null, 2)}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Stack>
  );
}

export default function NegotiationScreen() {
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<string | undefined>();

  const list = useResource(
    `sessions:${status}`,
    (c, signal) => sessions(c, status ? { status } : {}, signal),
    { refreshInterval: CADENCE.orders },
  );

  const rows = list.data?.sessions ?? [];

  return (
    <section data-screen="negotiation">
      <Typography variant="h2" sx={{ fontSize: 20, fontWeight: 600, mb: 0.5 }}>
        Negotiation
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Buyer sessions and their conversation history.
      </Typography>

      <WritesNotice what="Listing sessions marks any session past its expiry as expired and saves that." />

      {/* An honest note about the API, not about this console. Someone reading
          a list of every buyer's sessions should know the agent did not check
          who was asking — otherwise they may reasonably assume the view is
          scoped to their own key, and it is not. */}
      <Alert severity="warning" variant="outlined" sx={{ mb: 2 }} data-note="unscoped">
        These routes accept any caller. The agent declares no authentication on
        them, so this list spans every buyer's sessions and is not scoped to the
        key this console is using — and anyone who can reach the agent can read
        the same thing.
      </Alert>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <TextField
          select
          size="small"
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          {STATUSES.map((s) => (
            <MenuItem key={s || "any"} value={s}>
              {s || "Any status"}
            </MenuItem>
          ))}
        </TextField>
      </Paper>

      <Box
        data-freshness={list.freshness}
        sx={{
          mb: 1,
          fontSize: 12,
          color: list.freshness === "stale" ? palette.warningText : palette.textSecondary,
        }}
      >
        {list.freshness === "live" && plural(rows.length, "session")}
        {list.freshness === "stale" && "couldn't refresh — showing the last list received"}
        {list.freshness === "empty" &&
          (list.loading ? "loading…" : list.result ? describe(list.result) : "")}
      </Box>

      <Paper variant="outlined">
        {list.loading && rows.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Skeleton height={28} />
          </Box>
        ) : rows.length === 0 ? (
          <Box sx={{ p: 3 }} data-state="empty">
            <Typography variant="body2" color="text.secondary">
              {list.freshness === "empty" && list.result?.kind === "unavailable"
                ? describe(list.result)
                : status
                  ? `No ${status} sessions.`
                  : "No sessions yet."}
            </Typography>
          </Box>
        ) : (
          <Table size="small" data-state="rows">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Session</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Stage</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Messages</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Updated</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <Fragment key={row.session_id}>
                  <TableRow hover data-row="session">
                    <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                      {row.session_id}
                    </TableCell>
                    <TableCell>
                      <StatusChip status={row.status} />
                    </TableCell>
                    <TableCell sx={{ fontSize: 12 }}>
                      {row.negotiation_stage.replace(/_/g, " ") || "—"}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{row.message_count}</TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                      {stamp(row.updated_at)}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        onClick={() =>
                          setOpen((c) => (c === row.session_id ? undefined : row.session_id))
                        }
                        aria-expanded={open === row.session_id}
                      >
                        {open === row.session_id ? "Hide" : "Messages"}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {open === row.session_id && (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ backgroundColor: palette.ground }}>
                        <Conversation sessionId={row.session_id} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
    </section>
  );
}
