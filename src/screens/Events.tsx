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
import Typography from "@mui/material/Typography";
import { events, type EventRecord, type EventsQuery } from "../api/endpoints";
import { describe } from "../api/errors";
import { GatedNotice } from "../components/GatedNotice";
import { DataPanel, FreshnessNote } from "../components/DataPanel";
import { PageHeader } from "../components/PageHeader";
import { clock as stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import { useResource } from "../query/useResource";
import { FormRow } from "../components/WriteForm";
import { TipField } from "../components/TipField";
import { EventLookup } from "./mutations";
import { EnumSelect } from "../components/EnumSelect";
import { EVENT_TYPES } from "../api/vocabulary";
import { palette } from "../theme/palette";

const LIMIT = 50;

const FILTER_HINTS = {
  flow_id: "Shows only events with this flow id, matched as typed. Optional.",
  session_id: "Shows only events with this session id, matched as typed. Optional.",
} as const;

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
      {/* The API has no cursor: ?limit returns the most recent N with no way to
          page backwards. Calling this a log would overstate it. */}
      <PageHeader
        title="Events"
        subtitle={`The ${LIMIT} most recent events. This is a tail, not a full log — the API offers no way to page further back.`}
      >

      {feed.freshness === "blocked" ? (
        <GatedNotice what="The event stream" result={feed.result} />
      ) : (
        <>
          <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }}>
            <FormRow>
              {/* Matched exactly upstream, so a typed type that is nearly
                  right returns nothing. Offer the set instead. */}
              <EnumSelect
                hint="Shows only events of this exact type. Any type shows the latest events of every kind."
                label="Event type"
                value={filters.event_type}
                options={EVENT_TYPES}
                onChange={(v) => setFilters((f) => ({ ...f, event_type: v }))}
                any="Any type"
                sx={{ minWidth: 220 }}
              />
              {(
                [
                  ["flow_id", "Flow id"],
                  ["session_id", "Session id"],
                ] as const
              ).map(([field, label]) => (
                <TipField
                  hint={FILTER_HINTS[field]}
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
            </FormRow>
          </Paper>

          <FreshnessNote freshness={feed.freshness}>
            {feed.freshness === "live" && feed.asOf && `as of ${stamp(new Date(feed.asOf).toISOString())}`}
            {feed.freshness === "stale" && "couldn't refresh — showing the last events received"}
            {feed.freshness === "empty" &&
              (feed.loading ? "loading…" : feed.result ? describe(feed.result) : "")}
          </FreshnessNote>

          <DataPanel>
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
          </DataPanel>

          {selected && (
            <Paper variant="outlined" sx={{ mt: 2.5, p: 2.5 }} data-panel="event-detail">
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
              {selected.event_id && <EventLookup eventId={selected.event_id} />}
            </Paper>
          )}
        </>
      )}
      </PageHeader>
    </section>
  );
}
