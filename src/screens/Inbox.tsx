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
import {
  approvalById,
  approvals,
  decideApproval,
  resumeApproval,
  type ApprovalDecisionInput,
  type ApprovalRequestRecord,
  type DecisionAck,
} from "../api/endpoints";
import { describe, type Result } from "../api/errors";
import { ConfirmAction } from "../components/ConfirmAction";
import { DataPanel, FreshnessNote } from "../components/DataPanel";
import { Field, FieldGrid } from "../components/Field";
import { GatedNotice } from "../components/GatedNotice";
import { PageHeader } from "../components/PageHeader";
import { ReadOnlyNotice } from "../components/ReadOnlyNotice";
import { StatusChip } from "../components/StatusChip";
import { WritesNotice } from "../components/WritesNotice";
import { useCredential } from "../credentials/context";
import { plural, stamp } from "../lib/time";
import { CADENCE } from "../query/cadence";
import { useMutation } from "../query/useMutation";
import { useResource } from "../query/useResource";
import { FormRow, WriteForm } from "../components/WriteForm";
import { Hint } from "../components/Hint";
import { TipField } from "../components/TipField";
import { palette } from "../theme/palette";

/**
 * The approve/reject controls.
 *
 * Rendered disabled rather than hidden while writes are off: a control you
 * cannot find is worse than one you cannot press, and the notice above says
 * where the switch is. The form is deliberately plain — one reason field, one
 * name — because the agent stores both verbatim and neither is verified.
 */
function DecisionControls({
  approvalId,
  status,
  onDecided,
}: {
  approvalId: string;
  status: string;
  onDecided: (result: Result<unknown>) => void;
}) {
  const { writesEnabled } = useCredential();
  const [reason, setReason] = useState("");
  const [name, setName] = useState("");
  const [pendingDecision, setPendingDecision] = useState<"approve" | "reject" | undefined>();

  const decide = useMutation<{ id: string; body: ApprovalDecisionInput }, unknown>(
    (c, args) => decideApproval(c, args.id, args.body),
    // The queue and this gate's own detail both describe a decided approval
    // wrongly the moment it is decided.
    { invalidates: ["approvals", `approval:${approvalId}`] },
  );

  // A gate the agent has already answered, or let expire, is not ours to
  // decide. The control stays visible so the row does not change shape.
  const decidable = status === "pending";
  const busy = decide.pending;
  const blocked = !writesEnabled || !decidable;

  const outcome = decide.last;

  return (
    <Box sx={{ mt: 2 }} data-block="approval-controls">
      <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1 }}>Decide this gate</Typography>

      <FormRow>
        <TipField
          hint="Optional. Why you are approving or rejecting; recorded with the decision."
          size="small"
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={blocked || busy}
          sx={{ minWidth: 240 }}
        />
        <TipField
          hint="Who is deciding. Stored as typed and not verified; without it the agent records the literal anonymous."
          size="small"
          label="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={blocked || busy}
          sx={{ minWidth: 200 }}
        />
        <Hint hint="Approve this gate. You confirm first; the decision is recorded but the proposal flow is not resumed until you do that separately.">
        <Button
          size="small"
          variant="contained"
          data-action="approve"
          disabled={blocked || busy}
          onClick={() => setPendingDecision("approve")}
        >
          Approve
        </Button>
        </Hint>
        <Hint hint="Reject this gate. You confirm first; the decision is recorded but the proposal flow is not resumed until you do that separately.">
        <Button
          size="small"
          variant="outlined"
          data-action="reject"
          disabled={blocked || busy}
          onClick={() => setPendingDecision("reject")}
        >
          Reject
        </Button>
        </Hint>
      </FormRow>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75, mb: 1.5 }}>
        {/* Sent because the agent's own default is the literal "anonymous",
            which is a worse record than a name nobody checked. */}
        Name is stored as given; the agent does not verify it. Deciding only records the
        answer; resuming the flow, which hands it back, is offered here once the decision is in.
      </Typography>

      {!decidable && writesEnabled && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }} data-state="not-pending">
          This gate is {status.replace(/_/g, " ")} — only a pending gate can be decided.
        </Typography>
      )}

      {outcome && outcome.kind !== "ok" && (
        <Typography variant="body2" sx={{ mt: 1, color: palette.error }} data-state="write-failed">
          {describe(outcome)}
        </Typography>
      )}

      <ConfirmAction
        open={pendingDecision !== undefined}
        title={pendingDecision === "reject" ? "Reject this gate?" : "Approve this gate?"}
        confirmLabel={pendingDecision === "reject" ? "Reject" : "Approve"}
        pending={decide.pending}
        onCancel={() => setPendingDecision(undefined)}
        consequence={
          <>
            {/* What a failure leaves behind, said plainly, because the agent
                records the first decision and refuses a second: a retry after
                an unclear failure may answer about the earlier attempt. */}
            The agent records this decision. It does not act on it yet: the
            gated flow picks it up only when it is resumed, which you can do
            here next. It keeps the first decision it receives and refuses later
            ones, so if this fails without a clear answer, re-read the gate
            before trying again rather than deciding twice.
          </>
        }
        onConfirm={() => {
          const decision = pendingDecision;
          setPendingDecision(undefined);
          if (!decision) return;
          void decide
            .run({
              id: approvalId,
              body: {
                decision,
                ...(reason ? { reason } : {}),
                ...(name ? { decided_by: name } : {}),
              },
            })
            .then(onDecided);
        }}
      />
    </Box>
  );
}

/**
 * Hands a recorded decision back to the flow it gated. Offered only once a
 * decision exists: before that the agent refuses with a 400 ("has not been
 * decided yet"), so a Resume button beside Approve could only ever fail.
 *
 * Upstream resumes one kind of gate — a proposal decision — by re-creating
 * the proposal flow from its snapshot and emitting proposal.accepted,
 * .rejected or .countered. It stores nothing else, and it is not idempotent:
 * each call emits the event again. Deciding over MCP (`approve_or_reject`)
 * never resumes at all, which is why a gate decided elsewhere can be opened
 * here by id.
 */
function ResumeControls({
  approvalId,
  flowType,
  gateName,
  decision,
}: {
  approvalId: string;
  flowType: string;
  gateName: string;
  decision: string;
}) {
  const { writesEnabled } = useCredential();
  // No invalidation: resume changes nothing the approval reads return.
  const resume = useMutation<{ id: string }, DecisionAck>((c, args) => resumeApproval(c, args.id));

  if (flowType !== "proposal_handling" || gateName !== "proposal_decision") {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }} data-state="not-resumable">
        The agent can only resume proposal decisions. This gate is {flowType || "an unnamed flow"}
        {gateName ? ` / ${gateName}` : ""}, so there is no flow to hand the decision back to.
      </Typography>
    );
  }

  const event =
    decision === "approve" ? "proposal.accepted" : decision === "counter" ? "proposal.countered" : "proposal.rejected";
  const result = resume.last?.kind === "ok" ? resume.last.data : undefined;
  const field = (key: string) => (typeof result?.[key] === "string" ? result[key] : undefined);

  return (
    <Box sx={{ mt: 2 }} data-block="resume-controls">
      <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1 }}>Resume the flow</Typography>
      <WriteForm
        title="Resume the proposal flow?"
        confirmLabel="Resume flow"
        hint="Hands the recorded decision back to the proposal flow, which emits the matching proposal event. Resuming twice emits it twice."
        action="resume"
        blocked={!writesEnabled}
        pending={resume.pending}
        last={result ? undefined : resume.last}
        onConfirm={() => void resume.run({ id: approvalId })}
        consequence={
          <>
            Hands the recorded decision ({decision || "unreported"}) back to the proposal flow: the
            agent rebuilds the flow from its snapshot and emits <code>{event}</code>. It stores
            nothing else. Not idempotent: resuming again emits the event again.
          </>
        }
      />
      {result && (
        <Typography variant="body2" sx={{ mt: 1 }} data-state="resumed">
          Resumed. Proposal {field("proposal_id") ?? "—"} is now {field("status")?.replace(/_/g, " ") ?? "—"}
          {field("recommendation") ? `, from the decision to ${field("recommendation")}` : ""}.
        </Typography>
      )}
    </Box>
  );
}

function Decision({
  approvalId,
  locked,
  onLocked,
}: {
  approvalId: string;
  locked: boolean;
  onLocked: () => void;
}) {
  const detail = useResource(`approval:${approvalId}`, (c, signal) =>
    approvalById(c, approvalId, signal),
  );
  // Held on the list row, not inside this component: a successful decide
  // invalidates the queue, which remounts the expanded row and would otherwise
  // bring the controls back for the re-fetch window.

  if (detail.loading && !detail.data && !locked) return <Skeleton height={24} />;
  if (!detail.data && !locked) {
    return (
      <Typography variant="body2" color="text.secondary">
        {detail.result ? describe(detail.result) : "no detail"}
      </Typography>
    );
  }

  const request = detail.data?.request;
  const response = detail.data?.response ?? null;
  const decided = response !== null || locked;

  return (
    <Box sx={{ py: 1 }}>
      {request && (
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
      )}

      <Box sx={{ mt: 2 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 0.5 }}>Decision</Typography>
        {!response && !locked ? (
          <Typography variant="body2" color="text.secondary" data-state="undecided">
            Not decided yet.
          </Typography>
        ) : !response && locked ? (
          <Typography variant="body2" color="text.secondary" data-state="decision-sent">
            Decision sent. Re-reading the gate…
          </Typography>
        ) : response ? (
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
        ) : null}
      </Box>

      {response && request && (
        <ResumeControls
          approvalId={approvalId}
          flowType={request.flow_type}
          gateName={request.gate_name}
          decision={response.decision}
        />
      )}

      {!decided && (
        <DecisionControls
          approvalId={approvalId}
          status={request?.status ?? "pending"}
          onDecided={(result) => {
            if (result.kind === "ok") onLocked();
            detail.refresh();
          }}
        />
      )}
    </Box>
  );
}

export default function InboxScreen() {
  const [open, setOpen] = useState<string | undefined>();
  const [locked, setLocked] = useState<Readonly<Record<string, true>>>({});
  // Gates decided on this screen. The agent lists only pending gates, so a
  // decided one leaves the queue on the next read — and with it the only
  // place its Resume control could appear. They stay here, marked, until the
  // screen is left.
  const [decidedHere, setDecidedHere] = useState<Readonly<Record<string, ApprovalRequestRecord>>>({});
  const [lookupId, setLookupId] = useState("");
  const [opened, setOpened] = useState<string | undefined>();
  const { writesEnabled } = useCredential();

  const list = useResource("approvals", approvals, { refreshInterval: CADENCE.orders });
  const queued = list.data?.approvals ?? [];
  const queuedIds = new Set(queued.map((r) => r.approval_id));
  const rows = [...queued, ...Object.values(decidedHere).filter((r) => !queuedIds.has(r.approval_id))];
  const lock = (row: ApprovalRequestRecord) => {
    setLocked((current) => ({ ...current, [row.approval_id]: true }));
    setDecidedHere((current) => ({ ...current, [row.approval_id]: row }));
  };

  return (
    <section data-screen="inbox">
      {/* Said out loud rather than implied by a missing button: an approvals
          inbox you cannot act on is a monitoring view. Pretending otherwise
          would leave someone waiting for an approve control that is not
          coming. */}
      <PageHeader
        title="Inbox"
        subtitle="Pending approval gates, and the controls to decide them."
      >
      {list.freshness === "blocked" ? (
        <GatedNotice what="The approvals queue" result={list.result} />
      ) : (
        <>
          <WritesNotice what="Listing approvals marks any gate past its expiry as timed out and saves that." />
          {!writesEnabled && <ReadOnlyNotice what="Deciding a gate" />}

          <FreshnessNote freshness={list.freshness}>
            {list.freshness === "live" && plural(queued.length, "approval")}
            {list.freshness === "stale" && "couldn't refresh — showing the last queue received"}
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
                          {queuedIds.has(row.approval_id) ? (
                            <StatusChip status={row.status} />
                          ) : (
                            <>
                              <StatusChip status="decided" />
                              <Box sx={{ fontSize: 11, color: palette.textSecondary, mt: 0.25 }} data-state="left-queue">
                                decided here; out of the queue
                              </Box>
                            </>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{row.flow_type || "—"}</TableCell>
                        <TableCell sx={{ fontSize: 12, color: palette.textSecondary }}>
                          {stamp(row.created_at)}
                        </TableCell>
                        <TableCell align="right">
                          <Hint hint="Show or hide this gate's detail and its decision controls.">
                          <Button
                            size="small"
                            onClick={() =>
                              setOpen((c) => (c === row.approval_id ? undefined : row.approval_id))
                            }
                            aria-expanded={open === row.approval_id}
                          >
                            {open === row.approval_id ? "Hide" : "Details"}
                          </Button>
                          </Hint>
                        </TableCell>
                      </TableRow>
                      {open === row.approval_id && (
                        <TableRow>
                          <TableCell colSpan={5} sx={{ backgroundColor: palette.ground }}>
                            <Decision
                              approvalId={row.approval_id}
                              locked={locked[row.approval_id] === true}
                              onLocked={() => lock(row)}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </DataPanel>

          {/* A gate decided anywhere else — Claude Code's approve_or_reject,
              another console, a previous visit — is out of the queue and
              was never resumed. The agent can still read it by id. */}
          <Paper variant="outlined" sx={{ p: 2.5, mt: 2.5 }} data-block="gate-lookup">
            <Typography variant="h3" sx={{ mb: 0.5 }}>
              Open a gate by id
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              The queue lists pending gates only. A gate decided elsewhere — including with the MCP
              tool <code>approve_or_reject</code>, which never resumes the flow — can be opened here
              to read its decision and resume it. Its id is in the <code>approval.granted</code> or{" "}
              <code>approval.denied</code> event.
            </Typography>
            <FormRow>
              <TipField
                hint="The approval id, found in the approval.granted or approval.denied event. Opens a gate that is no longer in the queue."
                size="small"
                label="Gate id"
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
                sx={{ minWidth: 320 }}
              />
              <Hint hint="Reads this gate from the agent so you can see its decision and resume it.">
              <Button
                size="small"
                variant="outlined"
                data-action="open-gate"
                disabled={!lookupId.trim()}
                onClick={() => setOpened(lookupId.trim())}
              >
                Open
              </Button>
              </Hint>
            </FormRow>
            {opened && (
              <Box sx={{ mt: 1.5 }} data-block="opened-gate">
                <Decision
                  key={opened}
                  approvalId={opened}
                  locked={locked[opened] === true}
                  onLocked={() => setLocked((current) => ({ ...current, [opened]: true }))}
                />
              </Box>
            )}
          </Paper>
        </>
      )}
      </PageHeader>
    </section>
  );
}
