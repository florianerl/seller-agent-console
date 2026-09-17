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
import { changeRequestById, changeRequests, reviewChangeRequest, applyChangeRequest, type ChangeRequestReviewInput, type FieldDiff } from "../api/endpoints";
import { describe } from "../api/errors";
import { ConfirmAction } from "../components/ConfirmAction";
import { DataPanel, FreshnessNote } from "../components/DataPanel";
import { Field, FieldGrid } from "../components/Field";
import { GatedNotice } from "../components/GatedNotice";
import { PageHeader } from "../components/PageHeader";
import { ReadOnlyNotice } from "../components/ReadOnlyNotice";
import { StatusChip } from "../components/StatusChip";
import { useCredential } from "../credentials/context";
import { plural, stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import { useMutation } from "../query/useMutation";
import { useResource } from "../query/useResource";
import { FormRow } from "../components/WriteForm";
import { ChangeRequestCreate, Panel } from "./mutations";
import { palette } from "../theme/palette";

/**
 * The list filter has to use the agent's words. Review requires
 * `pending_approval`; `failed` is a validation outcome at create time, not a
 * state this screen can act on.
 */
const STATUSES = ["", "pending_approval", "approved", "rejected", "applied", "failed"];

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

function ReviewControls({
  crId,
  status,
  onChanged,
}: {
  crId: string;
  status: string;
  onChanged: () => void;
}) {
  const { writesEnabled } = useCredential();
  const [reason, setReason] = useState("");
  const [name, setName] = useState("");
  const [pendingDecision, setPendingDecision] = useState<"approve" | "reject" | undefined>();
  const [pendingApply, setPendingApply] = useState(false);

  const invalidate = {
    invalidates: ["change-requests:*", `change-request:${crId}`] as const,
  };

  const review = useMutation<{ id: string; body: ChangeRequestReviewInput }, unknown>(
    (c, args) => reviewChangeRequest(c, args.id, args.body),
    invalidate,
  );
  const apply = useMutation<{ id: string }, unknown>(
    (c, args) => applyChangeRequest(c, args.id),
    invalidate,
  );

  const reviewable = status === "pending_approval";
  const applicable = status === "approved";
  const busy = review.pending || apply.pending;
  const blocked = !writesEnabled;
  const outcome = review.last ?? apply.last;

  return (
    <Box sx={{ mt: 1 }} data-block="change-request-controls">
      <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1 }}>Review this request</Typography>

      <FormRow>
        <TextField
          size="small"
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={blocked || !reviewable || busy}
          sx={{ minWidth: 240 }}
        />
        <TextField
          size="small"
          label="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={blocked || !reviewable || busy}
          sx={{ minWidth: 200 }}
        />
        <Button
          size="small"
          variant="contained"
          data-action="approve"
          disabled={blocked || !reviewable || busy}
          onClick={() => setPendingDecision("approve")}
        >
          Approve
        </Button>
        <Button
          size="small"
          variant="outlined"
          data-action="reject"
          disabled={blocked || !reviewable || busy}
          onClick={() => setPendingDecision("reject")}
        >
          Reject
        </Button>
        <Button
          size="small"
          data-action="apply"
          disabled={blocked || !applicable || busy}
          onClick={() => setPendingApply(true)}
        >
          {apply.pending ? "Applying…" : "Apply to order"}
        </Button>
      </FormRow>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
        Name is stored as given; the agent does not verify it
      </Typography>

      {writesEnabled && !reviewable && !applicable && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }} data-state="not-actionable">
          This request is {status.replace(/_/g, " ")} — only a pending-approval
          request can be reviewed, and only an approved one can be applied.
        </Typography>
      )}

      {outcome && outcome.kind !== "ok" && (
        <Typography variant="body2" sx={{ mt: 1, color: palette.error }} data-state="write-failed">
          {describe(outcome)}
        </Typography>
      )}

      <ConfirmAction
        open={pendingDecision !== undefined}
        title={pendingDecision === "reject" ? "Reject this change request?" : "Approve this change request?"}
        confirmLabel={pendingDecision === "reject" ? "Reject" : "Approve"}
        pending={review.pending}
        onCancel={() => setPendingDecision(undefined)}
        consequence={
          <>
            The agent records this decision on the change request. It keeps the
            first decision it receives and refuses later ones, so if this fails
            without a clear answer, re-read the request before trying again
            rather than reviewing twice.
          </>
        }
        onConfirm={() => {
          const decision = pendingDecision;
          setPendingDecision(undefined);
          if (!decision) return;
          void review
            .run({
              id: crId,
              body: {
                decision,
                ...(reason ? { reason } : {}),
                ...(name ? { decided_by: name } : {}),
              },
            })
            .then(onChanged);
        }}
      />

      <ConfirmAction
        open={pendingApply}
        title="Apply this change request to the order?"
        confirmLabel="Apply"
        pending={apply.pending}
        onCancel={() => setPendingApply(false)}
        consequence={
          <>
            The agent writes the proposed values onto the order and marks this
            request applied. A second apply is refused, so if this fails without
            a clear answer, re-read the request rather than applying twice.
          </>
        }
        onConfirm={() => {
          setPendingApply(false);
          void apply.run({ id: crId }).then(onChanged);
        }}
      />
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

  const decidedBy = cr.approved_by || cr.decided_by;
  const decidedAt = cr.approved_at || cr.decided_at;

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

      <ReviewControls crId={crId} status={cr.status} onChanged={detail.refresh} />
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
          </DataPanel>
        </>
      )}
      </PageHeader>
    </section>
  );
}
