import { z } from "zod";
import { get, request, type Connection } from "../http";
import type { Result } from "../errors";
import { MutationAck } from "./shared";

const PATHS = {
  sessions: "/sessions",
} as const;

// --- sessions (no auth dependency upstream at all) --------------------------

/**
 * These routes declare no auth dependency whatsoever: anonymous callers and
 * garbage keys both get 200, and `buyer_key` is a filter rather than a
 * boundary. Any caller can list every buyer's sessions. That is upstream's to
 * fix, but the screen says so rather than implying the list is scoped to us.
 *
 * Listing also writes: it flips expired sessions to `expired` and persists it.
 */
export const SessionSummary = z
  .object({
    session_id: z.string(),
    status: z.string().catch("unknown"),
    buyer_pricing_key: z.string().catch(""),
    message_count: z.number().catch(0),
    negotiation_stage: z.string().catch(""),
    created_at: z.string().nullable().catch(null),
    updated_at: z.string().nullable().catch(null),
  })
  .loose();
export type SessionSummary = z.infer<typeof SessionSummary>;

export const SessionList = z.object({ sessions: z.array(SessionSummary) }).loose();
export type SessionList = z.infer<typeof SessionList>;

export const sessions = (
  c: Connection,
  query: { status?: string; buyer_key?: string } = {},
  signal?: AbortSignal,
): Promise<Result<SessionList>> =>
  get(c, PATHS.sessions, { schema: SessionList, query, signal });

/** Message payloads vary by role, so the body stays unknown and is shown raw. */
export const SessionDetail = z
  .object({
    session_id: z.string(),
    status: z.string().catch("unknown"),
    buyer_pricing_key: z.string().catch(""),
    messages: z.array(z.looseObject({})).catch([]),
    linked_flow_ids: z.array(z.string()).catch([]),
    created_at: z.string().nullable().catch(null),
    updated_at: z.string().nullable().catch(null),
    expires_at: z.string().nullable().catch(null),
  })
  .loose();
export type SessionDetail = z.infer<typeof SessionDetail>;

export const sessionById = (
  c: Connection,
  sessionId: string,
  signal?: AbortSignal,
): Promise<Result<SessionDetail>> =>
  get(c, `${PATHS.sessions}/${encodeURIComponent(sessionId)}`, {
    schema: SessionDetail,
    signal,
  });

export const createSession = (
  c: Connection,
  body: { seat_id?: string; agent_url?: string } = {},
  signal?: AbortSignal,
): Promise<Result<SessionDetail>> =>
  request(c, PATHS.sessions, { schema: SessionDetail, method: "POST", body, signal });

export const sendSessionMessage = (
  c: Connection,
  sessionId: string,
  body: { message: string },
  signal?: AbortSignal,
): Promise<Result<SessionDetail>> =>
  request(c, `${PATHS.sessions}/${encodeURIComponent(sessionId)}/messages`, {
    schema: SessionDetail,
    method: "POST",
    body,
    signal,
  });

export const closeSession = (
  c: Connection,
  sessionId: string,
  signal?: AbortSignal,
): Promise<Result<MutationAck>> =>
  request(c, `${PATHS.sessions}/${encodeURIComponent(sessionId)}/close`, {
    schema: MutationAck,
    method: "POST",
    signal,
  });
