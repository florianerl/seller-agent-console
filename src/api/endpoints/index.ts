import { z } from "zod";
import { get, TIMEOUTS, type Connection } from "../http";
import type { Result } from "../errors";

/**
 * Narrow schemas: only the fields the UI renders, and `.loose()` throughout so
 * upstream additions never fail a parse. Generated from openapi.json was not an
 * option — 39 of its 44 GET responses carry an empty schema and its
 * securitySchemes is null, so a client generated from it would type every route
 * this console reads as unknown, with no auth wiring.
 *
 * Paths never end in a slash: FastAPI's redirect_slashes answers a mismatch
 * with a 307, which we refuse to follow. A guard asserts this.
 */

export const PATHS = {
  root: "/",
  health: "/health",
  events: "/events",
  apiKeys: "/auth/api-keys",
  inventorySyncStatus: "/api/v1/inventory-sync/status",
  inventorySyncWatermark: "/api/v1/inventory-sync/watermark",
  rateCard: "/api/v1/rate-card",
  orders: "/api/v1/orders",
  dealsExport: "/api/v1/deals/export",
} as const;

// --- root -------------------------------------------------------------------

/**
 * `version` is a hardcoded literal upstream that has already drifted from the
 * app's declared version, so it is surfaced as "reported version", never as
 * authoritative.
 */
export const RootInfo = z
  .object({
    name: z.string(),
    version: z.string(),
  })
  .loose();
export type RootInfo = z.infer<typeof RootInfo>;

export const root = (c: Connection, signal?: AbortSignal): Promise<Result<RootInfo>> =>
  get(c, PATHS.root, { schema: RootInfo, timeoutMs: TIMEOUTS.probe, signal });

// --- health -----------------------------------------------------------------

export const Health = z.object({ status: z.string() }).loose();
export type Health = z.infer<typeof Health>;

export const health = (c: Connection, signal?: AbortSignal): Promise<Result<Health>> =>
  get(c, PATHS.health, { schema: Health, timeoutMs: TIMEOUTS.probe, signal });

// --- inventory sync ---------------------------------------------------------

export const SyncStatus = z
  .object({
    enabled: z.boolean(),
    last_sync: z.string().nullable().catch(null),
    sync_count: z.number().catch(0),
    task_running: z.boolean().catch(false),
  })
  .loose();
export type SyncStatus = z.infer<typeof SyncStatus>;

export const inventorySyncStatus = (
  c: Connection,
  signal?: AbortSignal,
): Promise<Result<SyncStatus>> =>
  get(c, PATHS.inventorySyncStatus, { schema: SyncStatus, signal });

/**
 * Two shapes: a synced agent reports timestamps, an unsynced one reports a
 * null with a message. The union keeps both renderable.
 */
export const Watermark = z
  .object({
    last_sync_at: z.string().nullable(),
    was_incremental: z.boolean().optional(),
    since_timestamp: z.string().nullable().optional(),
    message: z.string().optional(),
  })
  .loose();
export type Watermark = z.infer<typeof Watermark>;

export const inventorySyncWatermark = (
  c: Connection,
  signal?: AbortSignal,
): Promise<Result<Watermark>> =>
  get(c, PATHS.inventorySyncWatermark, { schema: Watermark, signal });

// --- events (operator only) -------------------------------------------------

export const EventRecord = z
  .object({
    event_type: z.string(),
    timestamp: z.string(),
    event_id: z.string().optional(),
    flow_id: z.string().nullable().optional(),
    session_id: z.string().nullable().optional(),
  })
  .loose();
export type EventRecord = z.infer<typeof EventRecord>;

export const EventsPage = z.object({ events: z.array(EventRecord) }).loose();
export type EventsPage = z.infer<typeof EventsPage>;

export type EventsQuery = {
  limit?: number;
  event_type?: string;
  flow_id?: string;
  session_id?: string;
};

export const events = (
  c: Connection,
  query: EventsQuery = {},
  signal?: AbortSignal,
): Promise<Result<EventsPage>> =>
  get(c, PATHS.events, { schema: EventsPage, query, signal });

/**
 * Detail for one event. The list response already carries everything the
 * table shows, so this exists for the fields it does not — payloads differ per
 * event type, so the body is kept unknown and rendered as formatted JSON.
 */
export const EventDetail = z.looseObject({});

export const eventById = (
  c: Connection,
  eventId: string,
  signal?: AbortSignal,
): Promise<Result<Record<string, unknown>>> =>
  get(c, `${PATHS.events}/${encodeURIComponent(eventId)}`, {
    schema: EventDetail,
    signal,
  }) as Promise<Result<Record<string, unknown>>>;

// --- api keys (operator only; used as the role probe) -----------------------

export const ApiKeySummary = z
  .object({
    key_id: z.string(),
    label: z.string().nullable().optional(),
    role: z.string().optional(),
    is_active: z.boolean().optional(),
    expires_at: z.string().nullable().optional(),
  })
  .loose();

/**
 * Deliberately permissive: this route is called to read its *status code*, not
 * its body. A shape change upstream must not turn "the key works" into
 * "unavailable" and lock an operator out of setup.
 */
export const ApiKeyList = z.unknown();

export const apiKeys = (c: Connection, signal?: AbortSignal): Promise<Result<unknown>> =>
  get(c, PATHS.apiKeys, { schema: ApiKeyList, timeoutMs: TIMEOUTS.probe, signal });
