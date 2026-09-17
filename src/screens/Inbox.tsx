import { Fragment, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { approvalById, approvals } from "../api/endpoints";
import { describe } from "../api/errors";
import { Field, FieldGrid } from "../components/Field";
import { GatedNotice } from "../components/GatedNotice";
import { StatusChip } from "../components/StatusChip";
import { WritesNotice } from "../components/WritesNotice";
import { plural, stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import { useResource } from "../query/useResource";
import { palette } from "../theme/palette";

function Decision({ approvalId }: { approvalId: string }) {
  const detail = useResource(`approval:${approvalId}`, (c, signal) =>
    approvalById(c, approvalId, signal),
  );

  if (detail.loading && !detail.data) return <Skeleton height={24} />;
  if (!detail.data) {
    return (
      <Typography variant="body2" color="text.secondary">
        {detail.result ? describe(detail.result) : "no detail"}
      </Typography>
    );
  }

  const { request, response } = detail.data;

  return (
    <Box sx={{ py: 1 }}>
      <FieldGrid data-block="approval-detail">
        <Field label="Flow">{request.flow_type || "—"}</Field>
        <Field label="Flow id">
          <Box component="span" sx={{ fontFamily: "monospace", fontSize: 12 }}>
            {request.flow_id || "—"}
          </Box>
        </Field>
        <Field label="Proposal">{request.proposal_id || "—"}</Field>
        <Field label="Deal">{request.deal_id || "—"}</Field>
        <Field label="Expires">{stamp(request.expires_at)}</Field>
      </FieldGrid>

      <Box sx={{ mt: 2 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 0.5 }}>Decision</Typography>
        {!response ? (
          <Typography variant="body2" color="text.secondary" data-state="undecided">
            Not decided yet.
          </Typography>
        ) : (
          <FieldGrid data-block="approval-decision">
            <Field label="Decision">{response.decision}</Field>
            <Field label="When">{stamp(response.decided_at)}</Field>
            {/* Two claims about who decided, and they are not the same kind of
                thing. decided_by_principal is derived from the authenticated
                key; decided_by is free text the caller supplied and the agent
                never checked. Showing them under one heading would launder an
                unverified claim into attribution. */}
            <Field label="Principal (verified)">
              <Box component="span" sx={{ fontFamily: "monospace", fontSize: 12 }}>
                {response.decided_by_principal || "—"}
              </Box>
            </Field>
            <Field label="Name given (unverified)">{response.decided_by || "—"}</Field>
            <Field label="Reason">{response.reason || "—"}</Field>
          </FieldGrid>
        )}
      </Box>
    </Box>
  );
}

export default function InboxScreen() {
  const [open, setOpen] = useState<string | undefined>();

  const list = useResource("approvals", approvals, { refreshInterval: CADENCE.orders });
  const rows = list.data?.approvals ?? [];

  return (
    <section data-screen="inbox">
      <Typography variant="h2" sx={{ fontSize: 20, fontWeight: 600, mb: 0.5 }}>
        Inbox
      </Typography>
      {/* Said out loud rather than implied by a missing button: an approvals
          inbox you cannot act on is a monitoring view. Pretending otherwise
          would leave someone waiting for an approve control that is not
          coming. */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Pending approval gates. This is a monitoring view — approve and reject
        are writes, so they happen in the agent, not here.
      </Typography>

      {list.freshness === "blocked" ? (
        <GatedNotice what="The approvals queue" result={list.result} />
      ) : (
        <>
          <WritesNotice what="Listing approvals marks any gate past its expiry as timed out and saves that." />

          <Box
            data-freshness={list.freshness}
            sx={{
              mb: 1,
              fontSize: 12,
              color: list.freshness === "stale" ? palette.warningText : palette.textSecondary,
            }}
          >
            {list.freshness === "live" && plural(rows.length, "approval")}
            {list.freshness === "stale" && "couldn't refresh — showing the last queue received"}
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
                    : "Nothing waiting for approval."}
                </Typography>
              </Box>
            ) : (
              <Table size="small" data-state="rows">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Gate</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Flow</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Raised</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <Fragment key={row.approval_id}>
                      <TableRow hover data-row="approval">
                        <TableCell sx={{ fontSize: 13 }}>{row.gate_name || "—"}</TableCell>
                        <TableCell>
                          <StatusChip status={row.status} />
                        </TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{row.flow_type || "—"}</TableCell>
                        <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                          {stamp(row.created_at)}
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            onClick={() =>
                              setOpen((c) => (c === row.approval_id ? undefined : row.approval_id))
                            }
                            aria-expanded={open === row.approval_id}
                          >
                            {open === row.approval_id ? "Hide" : "Details"}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {open === row.approval_id && (
                        <TableRow>
                          <TableCell colSpan={5} sx={{ backgroundColor: palette.ground }}>
                            <Decision approvalId={row.approval_id} />
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
