import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
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
import { events, type EventRecord, type EventsQuery } from "../api/endpoints";
import { describe } from "../api/errors";
import { GatedNotice } from "../components/GatedNotice";
import { clock as stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";

const LIMIT = 50;

export default function EventsScreen() {
  const [filters, setFilters] = useState({ event_type: "", flow_id: "", session_id: "" });
  const [selected, setSelected] = useState<EventRecord | undefined>();

  // Only send filters that are set; an empty string would filter to nothing.
  const query = useMemo<EventsQuery>(() => {
    const q: EventsQuery = { limit: LIMIT };
    if (filters.event_type.trim()) q.event_type = filters.event_type.trim();
    if (filters.flow_id.trim()) q.flow_id = filters.flow_id.trim();
    if (filters.session_id.trim()) q.session_id = filters.session_id.trim();
    return q;
  }, [filters]);

  const key = `events:${JSON.stringify(query)}`;
  const feed = useResource(key, (connection, signal) => events(connection, query, signal), {
    refreshInterval: CADENCE.events,
  });

  const rows = feed.data?.events ?? [];

  return (
    <section data-screen="events">
      <Typography variant="h2" sx={{ fontSize: 20, fontWeight: 600, mb: 0.5 }}>
        Events
      </Typography>
      {/* The API has no cursor: ?limit returns the most recent N with no way to
          page backwards. Calling this a log would overstate it. */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        The {LIMIT} most recent events. This is a tail, not a full log — the API
        offers no way to page further back.
      </Typography>

      {feed.freshness === "blocked" ? (
        <GatedNotice what="The event stream" result={feed.result} />
      ) : (
        <>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              {(
                [
                  ["event_type", "Event type"],
                  ["flow_id", "Flow id"],
                  ["session_id", "Session id"],
                ] as const
              ).map(([field, label]) => (
                <TextField
                  key={field}
                  label={label}
                  size="small"
                  value={filters[field]}
                  onChange={(e) => setFilters((f) => ({ ...f, [field]: e.target.value }))}
                  sx={{ minWidth: 180 }}
                />
              ))}
              <Button
                size="small"
                onClick={() => setFilters({ event_type: "", flow_id: "", session_id: "" })}
                disabled={!filters.event_type && !filters.flow_id && !filters.session_id}
              >
                Clear
              </Button>
            </Stack>
          </Paper>

          <Box
            data-freshness={feed.freshness}
            sx={{
              mb: 1,
              fontSize: 12,
              color: feed.freshness === "stale" ? palette.warningText : palette.textSecondary,
            }}
          >
            {feed.freshness === "live" && feed.asOf && `as of ${stamp(new Date(feed.asOf).toISOString())}`}
            {feed.freshness === "stale" && "couldn't refresh — showing the last events received"}
            {feed.freshness === "empty" &&
              (feed.loading ? "loading…" : feed.result ? describe(feed.result) : "")}
          </Box>

          <Paper variant="outlined">
            {feed.loading && rows.length === 0 ? (
              <Box sx={{ p: 2 }}>
                <Skeleton height={28} />
                <Skeleton height={28} />
                <Skeleton height={28} />
              </Box>
            ) : rows.length === 0 ? (
              <Box sx={{ p: 3 }} data-state="empty">
                <Typography variant="body2" color="text.secondary">
                  {feed.freshness === "empty" && feed.result?.kind === "unavailable"
                    ? describe(feed.result)
                    : "No events match."}
                </Typography>
              </Box>
            ) : (
              <Table size="small" data-state="rows">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>When</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Flow</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((event, index) => (
                    <TableRow
                      key={event.event_id ?? `${event.timestamp}-${index}`}
                      hover
                      onClick={() => setSelected(event)}
                      sx={{ cursor: "pointer" }}
                      data-row="event"
                    >
                      <TableCell>
                        <Chip
                          label={event.event_type}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: 12 }}
                        />
                      </TableCell>
                      <TableCell sx={{ color: palette.textSecondary }}>
                        {stamp(event.timestamp)}
                      </TableCell>
                      <TableCell sx={{ color: palette.textSecondary, fontSize: 12 }}>
                        {event.flow_id ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>

          {selected && (
            <Paper variant="outlined" sx={{ mt: 2, p: 2 }} data-panel="event-detail">
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                  {selected.event_type}
                </Typography>
                <Button size="small" onClick={() => setSelected(undefined)}>
                  Close
                </Button>
              </Stack>
              <Box
                component="pre"
                sx={{
                  mt: 1,
                  p: 1.5,
                  backgroundColor: palette.ground,
                  fontSize: 12,
                  overflow: "auto",
                  maxHeight: 320,
                }}
              >
                {JSON.stringify(selected, null, 2)}
              </Box>
            </Paper>
          )}
        </>
      )}
    </section>
  );
}
