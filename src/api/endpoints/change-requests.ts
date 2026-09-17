import { z } from "zod";
import { get, type Connection } from "../http";
import type { Result } from "../errors";

const PATHS = {
  changeRequests: "/api/v1/change-requests",
} as const;

// --- change requests -----------------------------------------------------

/**
 * A change request proposes edits to a live order and moves through its own
 * approve/reject/apply flow (see the sibling `/review` and `/apply` routes,
 * neither of which is a read and neither of which is wired up here).
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
    status: z.string().catch("pending"),
    diffs: z.array(FieldDiff).catch([]),
    reason: z.string().catch(""),
    requested_by: z.string().catch("system"),
    decided_by: z.string().nullable().catch(null),
    decided_at: z.string().nullable().catch(null),
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
