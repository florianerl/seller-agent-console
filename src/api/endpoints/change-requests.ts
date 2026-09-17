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
 * operator-only upstream; apply writes the proposed values onto the order.
 *
 * Both GET responses carry an empty schema in openapi.json, and the local
 * instance has no change requests to observe live (`{"change_requests":[],
 * "count":0}`), so this shape is inferred rather than confirmed: it mirrors
 * the fields openapi.json *does* define for creating and reviewing one
 * (`CreateChangeRequestModel`, `ReviewChangeRequestModel`) plus the identifiers
 * a list/detail pair would need to exist at all. Treat every field here as
 * provisional until it's been seen on the wire.
 */
export const FieldDiff = z
  .object({
    field: z.string(),
    old_value: z.unknown().catch(null),
    new_value: z.unknown().catch(null),
  })
  .loose();
export type FieldDiff = z.infer<typeof FieldDiff>;

export const ChangeRequest = z
  .object({
    cr_id: z.string(),
    order_id: z.string().catch(""),
    change_type: z.string().catch(""),
    status: z.string().catch("pending_approval"),
    diffs: z.array(FieldDiff).catch([]),
    reason: z.string().catch(""),
    requested_by: z.string().catch("system"),
    // The review route stamps `approved_by` / `approved_at` for both approve
    // and reject. `decided_by` was the name this console inferred before that
    // body was observed; keep reading it so an older payload still shows.
    decided_by: z.string().nullable().catch(null),
    decided_at: z.string().nullable().catch(null),
    approved_by: z.string().nullable().catch(null),
    approved_at: z.string().nullable().catch(null),
    created_at: z.string().nullable().catch(null),
  })
  .loose();
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

export const changeRequestById = (
  c: Connection,
  crId: string,
  signal?: AbortSignal,
): Promise<Result<ChangeRequest>> =>
  get(c, `${PATHS.changeRequests}/${encodeURIComponent(crId)}`, {
    schema: ChangeRequest,
    signal,
  });

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
    reason?: string;
  },
  signal?: AbortSignal,
): Promise<Result<ChangeRequestAck>> =>
  request(c, PATHS.changeRequests, { schema: ChangeRequestAck, method: "POST", body, signal });
