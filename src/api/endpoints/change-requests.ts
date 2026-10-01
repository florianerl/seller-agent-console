import { z } from "zod";
import { get, request, type Connection } from "../http";
import type { Result } from "../errors";

const PATHS = {
  changeRequests: "/api/v1/change-requests",
} as const;

// --- change requests -----------------------------------------------------

/**
 * A change request proposes edits to a live order and moves through its own
 * approve/reject/apply flow (`POST …/review` and `POST …/apply`). Review is
 * operator-only upstream; apply writes the proposed values into the order's
 * metadata (never its status — see order-lifecycle.ts).
 *
 * Both GET responses carry an empty schema in openapi.json. This shape was
 * first inferred, and the inference was wrong where it mattered: it keyed on
 * `cr_id`, which is only the *path parameter's* name, while the record says
 * `change_request_id` (models/change_request.py), and it read `created_at`
 * where the record says `requested_at`. Against a real agent every list
 * failed to parse. The fields below are the ones seen on the wire from a
 * live agent (tests/fixtures/change-request.live.json); the inferred names
 * are still read as fallbacks so an older fixture or proxy keeps working.
 */
export const FieldDiff = z
  .object({
    field: z.string(),
    old_value: z.unknown().catch(null),
    new_value: z.unknown().catch(null),
  })
  .loose();
export type FieldDiff = z.infer<typeof FieldDiff>;

const nullableString = z.string().nullable().catch(null);

const ChangeRequestWire = z
  .object({
    change_request_id: z.string().optional(),
    cr_id: z.string().optional(),
    order_id: z.string().catch(""),
    deal_id: nullableString,
    change_type: z.string().catch(""),
    status: z.string().catch("pending_approval"),
    // minor | material | critical — decides whether it was auto-approved.
    severity: nullableString,
    diffs: z.array(FieldDiff).catch([]),
    proposed_values: z.record(z.string(), z.unknown()).nullable().catch(null),
    reason: z.string().catch(""),
    requested_by: z.string().catch("system"),
    requested_at: nullableString,
    created_at: nullableString,
    // The review route stamps `approved_by` / `approved_at` for both approve
    // and reject; a minor change carries `system:auto-approve` here.
    approved_by: nullableString,
    approved_at: nullableString,
    decided_by: nullableString,
    decided_at: nullableString,
    rejection_reason: z.string().catch(""),
    // Set when validation refused the request at create time (status failed).
    validation_errors: z.array(z.string()).catch([]),
    applied_at: nullableString,
    applied_by: nullableString,
  })
  .loose();

export const ChangeRequest = ChangeRequestWire.refine(
  (v) => Boolean(v.change_request_id ?? v.cr_id),
  { message: "change request carries no id" },
).transform((v) => ({
  ...v,
  /** The one id the rest of the console uses, whichever name it arrived under. */
  id: (v.change_request_id ?? v.cr_id) as string,
  requested_at: v.requested_at ?? v.created_at,
  decided_by: v.approved_by ?? v.decided_by,
  decided_at: v.approved_at ?? v.decided_at,
}));
export type ChangeRequest = z.infer<typeof ChangeRequest>;

export const ChangeRequestList = z
  .object({ change_requests: z.array(ChangeRequest), count: z.number().catch(0) })
  .loose();
export type ChangeRequestList = z.infer<typeof ChangeRequestList>;

export const changeRequests = (
  c: Connection,
  query: { order_id?: string; status?: string } = {},
  signal?: AbortSignal,
): Promise<Result<ChangeRequestList>> =>
  get(c, PATHS.changeRequests, { schema: ChangeRequestList, query, signal });

// --- writes -----------------------------------------------------------------

/**
 * | Call   | Idempotent on retry?                         | Confirm? | A failure leaves behind |
 * |--------|----------------------------------------------|----------|-------------------------|
 * | review | No. The agent records the first decision and | Yes      | Either the request is approved/rejected, or it is still pending_approval. There is no half-review. |
 * |        | 409s a second (`not_pending_approval`), so a |          | |
 * |        | retry after an unclear failure can answer    |          | |
 * |        | about the earlier attempt.                   |          | |
 * | apply  | No. Apply writes proposed values onto the    | Yes      | The order is updated and the request is `applied`, or neither happened. A second apply 409s (`not_approved`). |
 * |        | order and marks the request applied.         |          | |
 *
 * Both are refused before they are sent while the write switch is off.
 */

export type ChangeRequestReviewInput = {
  readonly decision: "approve" | "reject";
  readonly decided_by?: string;
  readonly reason?: string;
};

export const ChangeRequestAck = z.looseObject({});
export type ChangeRequestAck = z.infer<typeof ChangeRequestAck>;

export const reviewChangeRequest = (
  c: Connection,
  crId: string,
  body: ChangeRequestReviewInput,
  signal?: AbortSignal,
): Promise<Result<ChangeRequestAck>> =>
  request(c, `${PATHS.changeRequests}/${encodeURIComponent(crId)}/review`, {
    schema: ChangeRequestAck,
    method: "POST",
    body,
    signal,
  });

/** Applies an approved request to the order. Takes no body. */
export const applyChangeRequest = (
  c: Connection,
  crId: string,
  signal?: AbortSignal,
): Promise<Result<ChangeRequestAck>> =>
  request(c, `${PATHS.changeRequests}/${encodeURIComponent(crId)}/apply`, {
    schema: ChangeRequestAck,
    method: "POST",
    signal,
  });

export const createChangeRequest = (
  c: Connection,
  body: {
    idempotency_key: string;
    order_id: string;
    change_type: string;
    diffs?: { field: string; old_value?: unknown; new_value?: unknown }[];
    // Merged into the order's metadata on apply; diffs only add `_changed_*`.
    proposed_values?: Record<string, unknown>;
    reason?: string;
    requested_by?: string;
  },
  signal?: AbortSignal,
): Promise<Result<ChangeRequestAck>> =>
  request(c, PATHS.changeRequests, { schema: ChangeRequestAck, method: "POST", body, signal });
