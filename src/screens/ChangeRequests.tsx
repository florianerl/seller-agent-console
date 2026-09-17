import { Fragment, useState } from "react";
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
import { changeRequestById, changeRequests, type FieldDiff } from "../api/endpoints";
import { describe } from "../api/errors";
import { Field, FieldGrid } from "../components/Field";
import { GatedNotice } from "../components/GatedNotice";
import { StatusChip } from "../components/StatusChip";
import { plural, stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";

/**
 * The wire schema for a change request is inferred, not observed (see the
 * comment in src/api/endpoints/change-requests.ts) — openapi.json gives it an
 * empty response body and the local store has never held one to sample. There
 * is no confirmed enum to filter on, so this list mirrors the review states
 * `ReviewChangeRequestModel` implies plus the two a request starts and ends in.
 * If the real agent uses different words, this filter will silently match
 * nothing rather than error, which is the right failure for a guess.
 */
const STATUSES = ["", "pending", "approved", "rejected", "applied"];

/** A diff value can be any JSON the agent stored; render it as text, not as a type error. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function DiffRow({ diff }: { diff: FieldDiff }) {
  return (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "baseline", py: 0.5, fontSize: 12 }}>
      <Box sx={{ fontWeight: 600, minWidth: 120 }}>{diff.field}</Box>
      <Box sx={{ color: palette.textSecondary }}>{formatValue(diff.old_value)}</Box>
      <Box>→</Box>
      <Box>{formatValue(diff.new_value)}</Box>
    </Box>
  );
}

function Detail({ crId }: { crId: string }) {
  const detail = useResource(`change-request:${crId}`, (c, signal) =>
    changeRequestById(c, crId, signal),
  );

  if (detail.loading && !detail.data) return <Skeleton height={24} />;

  if (!detail.data) {
    return (
      <Typography variant="body2" color="text.secondary">
        {detail.result ? describe(detail.result) : "no detail"}
      </Typography>
    );
  }

  const cr = detail.data;

  return (
    <Stack spacing={2} sx={{ py: 1 }}>
      <FieldGrid data-block="change-request-detail">
        <Field label="Order">
          <Box component="span" sx={{ fontFamily: "monospace", fontSize: 12 }}>
            {cr.order_id || "—"}
          </Box>
        </Field>
        <Field label="Change type">{cr.change_type ? cr.change_type.replace(/_/g, " ") : "—"}</Field>
        <Field label="Requested by">{cr.requested_by || "—"}</Field>
        <Field label="Reason">{cr.reason || "—"}</Field>
        <Field label="Created">{stamp(cr.created_at)}</Field>
        {/* decided_by/decided_at only exist once the (not-yet-wired) review
            route has run; a still-pending request has neither, and that is a
            normal state, not a missing field. */}
        <Field label="Decided">
          {cr.decided_at ? `${stamp(cr.decided_at)} by ${cr.decided_by ?? "—"}` : "Not decided yet"}
        </Field>
      </FieldGrid>

      <Box>
        <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 0.5 }}>Proposed changes</Typography>
        {cr.diffs.length === 0 ? (
          <Typography variant="body2" color="text.secondary" data-state="no-diffs">
            No field changes recorded on this request.
          </Typography>
        ) : (
          <Box data-list="diffs">
            {cr.diffs.map((diff, index) => (
              <DiffRow key={`${diff.field}-${index}`} diff={diff} />
            ))}
          </Box>
        )}
      </Box>
    </Stack>
  );
}

export default function ChangeRequestsScreen() {
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState<string | undefined>();

  const list = useResource(
    `change-requests:${status}`,
    (connection, signal) => changeRequests(connection, status ? { status } : {}, signal),
    { refreshInterval: CADENCE.changeRequests },
  );

  const rows = list.data?.change_requests ?? [];

  return (
    <section data-screen="change-requests">
      <Typography variant="h2" sx={{ fontSize: 20, fontWeight: 600, mb: 0.5 }}>
        Change requests
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Proposed edits to live orders, awaiting review. Read-only — approving,
        rejecting, and applying a request are writes and happen in the agent,
        not here.
      </Typography>

      {list.freshness === "blocked" ? (
        <GatedNotice what="The change request queue" result={list.result} />
      ) : (
        <>
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
                  {s ? s.replace(/_/g, " ") : "Any status"}
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
            {list.freshness === "live" && plural(list.data?.count ?? rows.length, "change request")}
            {list.freshness === "stale" && "couldn't refresh — showing the last list received"}
            {list.freshness === "empty" &&
              (list.loading ? "loading…" : list.result ? describe(list.result) : "")}
          </Box>

          <Paper variant="outlined">
            {list.loading && rows.length === 0 ? (
              <Box sx={{ p: 2 }}>
                <Skeleton height={28} />
                <Skeleton height={28} />
              </Box>
            ) : rows.length === 0 ? (
              <Box sx={{ p: 3 }} data-state="empty">
                <Typography variant="body2" color="text.secondary">
                  {/* A fresh deployment genuinely has none of these yet — this
                      is the normal state, not a broken query. */}
                  {list.freshness === "empty" && list.result?.kind === "unavailable"
                    ? describe(list.result)
                    : status
                      ? `No change requests with status "${status.replace(/_/g, " ")}".`
                      : "No change requests yet."}
                </Typography>
              </Box>
            ) : (
              <Table size="small" data-state="rows">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Request</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Order</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Created</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((cr) => (
                    <Fragment key={cr.cr_id}>
                      <TableRow hover data-row="change-request">
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                          {cr.cr_id}
                        </TableCell>
                        <TableCell>
                          <StatusChip status={cr.status} />
                        </TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                          {cr.order_id || "—"}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                          {stamp(cr.created_at)}
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            onClick={() =>
                              setOpenId((current) => (current === cr.cr_id ? undefined : cr.cr_id))
                            }
                            aria-expanded={openId === cr.cr_id}
                          >
                            {openId === cr.cr_id ? "Hide details" : "Details"}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {openId === cr.cr_id && (
                        <TableRow>
                          <TableCell colSpan={5} sx={{ backgroundColor: palette.ground }}>
                            <Detail crId={cr.cr_id} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        </>
      )}
    </section>
  );
}
