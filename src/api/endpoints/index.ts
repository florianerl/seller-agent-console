import { z } from "zod";
import { get, TIMEOUTS, type Connection } from "../http";
import type { Result } from "../errors";

/**
 * Zod compiles validators with `new Function` when it can, and detects whether
 * it can by calling it inside a try/catch. Under this app's CSP —
 * `script-src 'self'`, no `'unsafe-eval'` — that call is blocked, the catch
 * fires, and Zod silently falls back. Functionally harmless, but it reports a
 * content-security-policy violation to the browser on every single load, which
 * puts a permanent entry in the issues panel and fails the Lighthouse
 * `inspector-issues` budget. Worse, it trains anyone looking at that panel to
 * ignore it.
 *
 * Telling Zod not to try is better than loosening the policy to permit eval.
 * The schemas here are small and parsed a few times a second at most; the
 * interpreted path costs nothing that matters.
 */
z.config({ jitless: true });

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
  deals: "/api/v1/deals",
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
  });

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

// --- orders ------------------------------------------------------------------

/**
 * Shapes taken from OrderStateMachine.to_dict and order_service, not from
 * openapi.json, whose order responses carry an empty schema.
 */
export const StateTransition = z
  .object({
    from_status: z.string(),
    to_status: z.string(),
    timestamp: z.string(),
    actor: z.string().catch("system"),
    reason: z.string().catch(""),
    transition_id: z.string().optional(),
  })
  .loose();
export type StateTransition = z.infer<typeof StateTransition>;

export const Order = z
  .object({
    order_id: z.string(),
    status: z.string(),
    deal_id: z.string().nullable().catch(null),
    created_at: z.string().nullable().catch(null),
  })
  .loose();
export type Order = z.infer<typeof Order>;

export const OrderList = z
  .object({ orders: z.array(Order), count: z.number().catch(0) })
  .loose();
export type OrderList = z.infer<typeof OrderList>;

export const orders = (
  c: Connection,
  query: { status?: string } = {},
  signal?: AbortSignal,
): Promise<Result<OrderList>> => get(c, PATHS.orders, { schema: OrderList, query, signal });

export const orderById = (
  c: Connection,
  orderId: string,
  signal?: AbortSignal,
): Promise<Result<Order>> =>
  get(c, `${PATHS.orders}/${encodeURIComponent(orderId)}`, { schema: Order, signal });

export const OrderHistory = z
  .object({
    order_id: z.string(),
    current_status: z.string().nullable().catch(null),
    transitions: z.array(StateTransition),
    transition_count: z.number().catch(0),
  })
  .loose();
export type OrderHistory = z.infer<typeof OrderHistory>;

export const orderHistory = (
  c: Connection,
  orderId: string,
  signal?: AbortSignal,
): Promise<Result<OrderHistory>> =>
  get(c, `${PATHS.orders}/${encodeURIComponent(orderId)}/history`, {
    schema: OrderHistory,
    // Audit trails scan storage and can be large.
    timeoutMs: TIMEOUTS.heavy,
    signal,
  });

// --- deals (operator only) --------------------------------------------------

/**
 * `GET /api/v1/deals` is the list. It is operator-only and spans every buyer's
 * deals, which is exactly what an operator console wants, and it answers in the
 * same shared wire shape as the single-deal route — so the list and a detail
 * never disagree about a status or a currency.
 *
 * Not `export?format=generic`, which was the obvious candidate: that route is a
 * DSP connector feed returning the raw stored records, so its statuses are the
 * internal vocabulary (`confirmed`, `deprecated`) and its prices are float
 * dollars. Reading the list from it would have meant showing one deal under two
 * different status words depending on where you looked.
 *
 * Unpaginated either way — it scans every `deal:*` key — so this gets the heavy
 * timeout and never polls.
 */
export const Money = z
  .object({ amount_micros: z.number(), currency: z.string().catch("USD") })
  .loose();
export type Money = z.infer<typeof Money>;

export const Deal = z
  .object({
    deal_id: z.string(),
    deal_type: z.string().catch("unknown"),
    status: z.string().catch("unknown"),
    quote_id: z.string().nullable().catch(null),
    product: z
      .object({ product_id: z.string().catch(""), name: z.string().catch("") })
      .loose()
      .nullable()
      .catch(null),
    pricing: z
      .object({
        final_cpm: Money.nullable().catch(null),
        base_cpm: Money.nullable().catch(null),
        pricing_model: z.string().catch("cpm"),
      })
      .loose()
      .nullable()
      .catch(null),
    terms: z
      .object({
        impressions: z.number().nullable().catch(null),
        flight_start: z.string().nullable().catch(null),
        flight_end: z.string().nullable().catch(null),
        guaranteed: z.boolean().catch(false),
      })
      .loose()
      .nullable()
      .catch(null),
    buyer_tier: z.string().catch("public"),
    expires_at: z.string().nullable().catch(null),
    created_at: z.string().nullable().catch(null),
  })
  .loose();
export type Deal = z.infer<typeof Deal>;

/** Each entry is the same envelope the single-deal route returns. */
export const DealEnvelope = z.object({ deal: Deal }).loose();
export type DealEnvelope = z.infer<typeof DealEnvelope>;

/**
 * `skipped` carries the ids of stored deals the agent could not map into the
 * wire shape. Without showing it the list is silently short, which on a deal
 * ledger is the kind of omission an operator has to be told about.
 */
export const DealList = z
  .object({
    deals: z.array(DealEnvelope),
    count: z.number().catch(0),
    skipped: z.array(z.string()).catch([]),
  })
  .loose();
export type DealList = z.infer<typeof DealList>;

export const deals = (
  c: Connection,
  query: { status?: string } = {},
  signal?: AbortSignal,
): Promise<Result<DealList>> =>
  get(c, PATHS.deals, { schema: DealList, query, timeoutMs: TIMEOUTS.heavy, signal });

/**
 * Upstream returns placeholder figures here — its own docstring says real
 * ad-server integration comes later — so the screen labels these as not
 * measured rather than rendering them as delivery truth.
 */
export const DealPerformance = z
  .object({
    deal_id: z.string(),
    impressions_available: z.number().catch(0),
    impressions_served: z.number().catch(0),
    fill_rate: z.number().catch(0),
    win_rate: z.number().catch(0),
    avg_cpm_actual: z.number().catch(0),
    delivery_pacing: z.string().catch("not_started"),
    last_updated: z.string().nullable().catch(null),
  })
  .loose();
export type DealPerformance = z.infer<typeof DealPerformance>;

export const dealPerformance = (
  c: Connection,
  dealId: string,
  signal?: AbortSignal,
): Promise<Result<DealPerformance>> =>
  get(c, `${PATHS.deals}/${encodeURIComponent(dealId)}/performance`, {
    schema: DealPerformance,
    signal,
  });

export const LineageLink = z
  .object({
    deal_id: z.string(),
    status: z.string().catch("unknown"),
    reason: z.string().nullable().catch(null),
  })
  .loose();
export type LineageLink = z.infer<typeof LineageLink>;

export const DealLineage = z
  .object({
    deal_id: z.string(),
    status: z.string().catch("unknown"),
    parents: z.array(LineageLink).catch([]),
    replacements: z.array(LineageLink).catch([]),
    chain_length: z.number().catch(1),
  })
  .loose();
export type DealLineage = z.infer<typeof DealLineage>;

export const dealLineage = (
  c: Connection,
  dealId: string,
  signal?: AbortSignal,
): Promise<Result<DealLineage>> =>
  get(c, `${PATHS.deals}/${encodeURIComponent(dealId)}/lineage`, {
    schema: DealLineage,
    signal,
  });
