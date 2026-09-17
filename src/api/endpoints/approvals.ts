import { z } from "zod";
import { get, type Connection } from "../http";
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
