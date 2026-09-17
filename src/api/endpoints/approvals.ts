import { z } from "zod";
import { get, request, type Connection } from "../http";
import type { Result } from "../errors";

const PATHS = {
  approvals: "/approvals",
} as const;

// --- approvals (any valid key; not operator-gated) --------------------------

/**
 * `GET /approvals` requires *a* key but not the operator role — a buyer key
 * reads it too. It also writes: listing flips any pending approval past its
 * `expires_at` to `timed_out` and persists that, so the screen discloses it.
 */
export const ApprovalRequestRecord = z
  .object({
    approval_id: z.string(),
    flow_id: z.string().catch(""),
    flow_type: z.string().catch(""),
    gate_name: z.string().catch(""),
    status: z.string().catch("pending"),
    proposal_id: z.string().catch(""),
    deal_id: z.string().catch(""),
    created_at: z.string().nullable().catch(null),
    expires_at: z.string().nullable().catch(null),
  })
  .loose();
export type ApprovalRequestRecord = z.infer<typeof ApprovalRequestRecord>;

export const ApprovalList = z
  .object({ approvals: z.array(ApprovalRequestRecord) })
  .loose();
export type ApprovalList = z.infer<typeof ApprovalList>;

export const approvals = (c: Connection, signal?: AbortSignal): Promise<Result<ApprovalList>> =>
  get(c, PATHS.approvals, { schema: ApprovalList, signal });

/**
 * A decision carries two different claims about who made it.
 * `decided_by_principal` is derived from the authenticated key;
 * `decided_by` is free text the caller supplied and the agent never checked.
 * The UI must not present them as the same kind of fact.
 */
export const ApprovalDecision = z
  .object({
    decision: z.string().catch(""),
    decided_by: z.string().catch(""),
    decided_by_principal: z.string().catch(""),
    decided_at: z.string().nullable().catch(null),
    reason: z.string().catch(""),
  })
  .loose();
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;

export const ApprovalDetail = z
  .object({
    request: ApprovalRequestRecord,
    response: ApprovalDecision.nullable().catch(null),
  })
  .loose();
export type ApprovalDetail = z.infer<typeof ApprovalDetail>;

export const approvalById = (
  c: Connection,
  approvalId: string,
  signal?: AbortSignal,
): Promise<Result<ApprovalDetail>> =>
  get(c, `${PATHS.approvals}/${encodeURIComponent(approvalId)}`, {
    schema: ApprovalDetail,
    signal,
  });

// --- writes -----------------------------------------------------------------

/**
 * The first mutations this console carries, and the table ADR 11 requires for
 * each one — the client answers none of this generically.
 *
 * | Call    | Idempotent on retry?                        | Confirm? | A failure leaves behind |
 * |---------|---------------------------------------------|----------|-------------------------|
 * | decide  | No. The agent records the first decision and | Yes      | Either the decision was recorded or it was not. There is no partial decision: the flow resumes or it stays gated. |
 * |         | rejects a second, so a retry after an         |          | |
 * |         | unclear failure can answer 409 rather than    |          | |
 * |         | duplicating. Retrying is safe; assuming the   |          | |
 * |         | retry's answer describes *this* attempt is not.|         | |
 * | resume  | Yes, in effect. Resuming a flow already       | Yes      | The flow either advanced or did not. Resuming twice is not two advances. |
 * |         | running is a no-op upstream.                  |          | |
 *
 * Both are refused before they are sent while the write switch is off
 * (src/api/policy.ts, ADR 12).
 */

/**
 * `decided_by` is free text the agent stores without checking — it is a label,
 * not attribution, and the detail view already says so. It is sent anyway
 * because the agent defaults it to the literal "anonymous", which is worse
 * than saying who was at the keyboard.
 */
export type ApprovalDecisionInput = {
  readonly decision: "approve" | "reject";
  readonly decided_by?: string;
  readonly reason?: string;
  readonly modifications?: Record<string, unknown>;
};

/**
 * The response body carries no schema upstream, so nothing is asserted about
 * it: what matters to a caller is that the decision was accepted, and the
 * approval is re-read afterwards rather than patched from this.
 */
export const DecisionAck = z.looseObject({});
export type DecisionAck = z.infer<typeof DecisionAck>;

export const decideApproval = (
  c: Connection,
  approvalId: string,
  body: ApprovalDecisionInput,
  signal?: AbortSignal,
): Promise<Result<DecisionAck>> =>
  request(c, `${PATHS.approvals}/${encodeURIComponent(approvalId)}/decide`, {
    schema: DecisionAck,
    method: "POST",
    body,
    signal,
  });

/** Resumes the flow an approval gated. Takes no body. */
export const resumeApproval = (
  c: Connection,
  approvalId: string,
  signal?: AbortSignal,
): Promise<Result<DecisionAck>> =>
  request(c, `${PATHS.approvals}/${encodeURIComponent(approvalId)}/resume`, {
    schema: DecisionAck,
    method: "POST",
    signal,
  });
