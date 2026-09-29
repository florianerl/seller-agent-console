import { Fragment, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { changeRequestById, changeRequests, type FieldDiff } from "../api/endpoints";
import { describe } from "../api/errors";
import { DataPanel, FreshnessNote } from "../components/DataPanel";
import { Field, FieldGrid } from "../components/Field";
import { GatedNotice } from "../components/GatedNotice";
import { PageHeader } from "../components/PageHeader";
import { ReadOnlyNotice } from "../components/ReadOnlyNotice";
import { StatusChip } from "../components/StatusChip";
import { useCredential } from "../credentials/context";
import { plural, stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import { useResource } from "../query/useResource";
import { ChangeRequestCreate, ChangeRequestReviewWrites, Panel } from "./mutations";
import { EnumSelect } from "../components/EnumSelect";
import { CHANGE_REQUEST_STATUSES } from "../api/vocabulary";
import { palette } from "../theme/palette";


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

  const decidedBy = cr.decided_by;
  const decidedAt = cr.decided_at;

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
        <Field label="Requested">{stamp(cr.requested_at)}</Field>
        {/* The review route stamps approved_by for both approve and reject,
            and does not verify the string. Shown as a label, not attribution. */}
        <Field label="Decided">
          {decidedAt ? `${stamp(decidedAt)} by ${decidedBy ?? "—"}` : "Not decided yet"}
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

      <ChangeRequestReviewWrites
        crId={crId}
        status={cr.status}
        changeType={cr.change_type}
        onChanged={detail.refresh}
      />
    </Stack>
  );
}

export default function ChangeRequestsScreen() {
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState<string | undefined>();
  const { writesEnabled } = useCredential();

  const list = useResource(
    `change-requests:${status}`,
    (connection, signal) => changeRequests(connection, status ? { status } : {}, signal),
    { refreshInterval: CADENCE.changeRequests },
  );

  const rows = list.data?.change_requests ?? [];

  return (
    <section data-screen="change-requests">
      <PageHeader
        title="Change requests"
        subtitle="Proposed edits to live orders. Review and apply are writes — they stay visible while the switch is off, disabled."
      >

      {list.freshness === "blocked" ? (
        <GatedNotice what="The change request queue" result={list.result} />
      ) : (
        <>
          {!writesEnabled && <ReadOnlyNotice what="Reviewing or applying a change request" />}
          <Panel title="Submit a request">
            <ChangeRequestCreate />
          </Panel>
          <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }}>
            {/* The agent's words, all of them. Review requires
                `pending_approval`; `failed` is a validation outcome at create
                time, not a state this screen can act on. */}
            <EnumSelect
              label="Status"
              value={status}
              options={CHANGE_REQUEST_STATUSES}
              onChange={setStatus}
              any="Any status"
            />
          </Paper>

          <FreshnessNote freshness={list.freshness}>
            {list.freshness === "live" && plural(list.data?.count ?? rows.length, "change request")}
            {list.freshness === "stale" && "couldn't refresh — showing the last list received"}
            {list.freshness === "empty" &&
              (list.loading ? "loading…" : list.result ? describe(list.result) : "")}
          </FreshnessNote>

          <DataPanel>
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
                    <Fragment key={cr.id}>
                      <TableRow hover data-row="change-request">
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                          {cr.id}
                        </TableCell>
                        <TableCell>
                          <StatusChip status={cr.status} />
                        </TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                          {cr.order_id || "—"}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                          {stamp(cr.requested_at)}
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            onClick={() =>
                              setOpenId((current) => (current === cr.id ? undefined : cr.id))
                            }
                            aria-expanded={openId === cr.id}
                          >
                            {openId === cr.id ? "Hide details" : "Details"}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {openId === cr.id && (
                        <TableRow>
                          <TableCell colSpan={5} sx={{ backgroundColor: palette.ground }}>
                            <Detail crId={cr.id} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </DataPanel>
        </>
      )}
      </PageHeader>
    </section>
  );
}
