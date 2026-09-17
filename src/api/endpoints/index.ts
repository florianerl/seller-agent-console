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
  approvals: "/approvals",
  sessions: "/sessions",
  agents: "/registry/agents",
  products: "/products",
  packages: "/packages",
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

// --- catalog ----------------------------------------------------------------

/**
 * Products, the rate card and the media kit answer identically to every caller
 * — no key, a bad key, an operator key, byte for byte. `/packages` does not:
 * it declares an optional auth dependency and returns a *different view* when
 * any valid key is presented. See `packages` below.
 */
export const Product = z
  .object({
    product_id: z.string(),
    name: z.string().catch(""),
    delivery_type: z.string().nullable().catch(null),
    pricing_model: z.string().nullable().catch(null),
    // Null for "pricing on request only" products. Not an error.
    base_price: Money.nullable().catch(null),
    ad_formats: z.array(z.string()).catch([]),
    available_impressions: z.number().nullable().catch(null),
  })
  .loose();
export type Product = z.infer<typeof Product>;

export const ProductList = z
  .object({
    products: z.array(Product),
    total_count: z.number().catch(0),
    limit: z.number().catch(50),
    offset: z.number().catch(0),
  })
  .loose();
export type ProductList = z.infer<typeof ProductList>;

export const products = (
  c: Connection,
  query: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<Result<ProductList>> => get(c, PATHS.products, { schema: ProductList, query, signal });

/**
 * `source` is the field that matters. "stored" is a rate card an operator set;
 * "defaults" is a hardcoded fallback list the agent invents when none exists.
 * Rendering the fallback as though it were configured pricing would be the
 * worst thing this screen could do.
 */
export const RateCardEntry = z
  .object({
    inventory_type: z.string(),
    base_cpm: z.number().nullable().catch(null),
    currency: z.string().catch("USD"),
    effective_date: z.string().nullable().catch(null),
    notes: z.string().nullable().catch(null),
  })
  .loose();
export type RateCardEntry = z.infer<typeof RateCardEntry>;

export const RateCard = z
  .object({
    entries: z.array(RateCardEntry),
    updated_at: z.string().nullable().catch(null),
    source: z.string().catch("defaults"),
  })
  .loose();
export type RateCard = z.infer<typeof RateCard>;

export const rateCard = (c: Connection, signal?: AbortSignal): Promise<Result<RateCard>> =>
  get(c, PATHS.rateCard, { schema: RateCard, timeoutMs: TIMEOUTS.normal, signal });

/**
 * The one catalog route whose *content* depends on the credential. With no key
 * it returns a public view carrying only a `price_range` band; with any valid
 * key it returns exact_price, floor_price and placements. The screen labels
 * what it shows as "as seen by this key" rather than as the catalog.
 */
export const Package = z
  .object({
    package_id: z.string(),
    name: z.string().catch(""),
    rate_type: z.string().nullable().catch(null),
    is_featured: z.boolean().catch(false),
    ad_formats: z.array(z.string()).catch([]),
    // Public view only.
    price_range: z.string().nullable().catch(null),
    // Authenticated view only.
    exact_price: z.number().nullable().catch(null),
    floor_price: z.number().nullable().catch(null),
    currency: z.string().nullable().catch(null),
    negotiation_enabled: z.boolean().nullable().catch(null),
  })
  .loose();
export type Package = z.infer<typeof Package>;

export const packages = (c: Connection, signal?: AbortSignal): Promise<Result<Package[]>> =>
  get(c, PATHS.packages, { schema: z.array(Package), signal });

// --- agent registry ---------------------------------------------------------

/**
 * Two different kinds of claim, which the screen must not blend.
 *
 * `trust_status` is the operator's own decision — approved, preferred, blocked.
 * `registry_sources[].verified_at` is an external registry confirming the agent
 * is registered with it. One is our judgement, the other is someone else's
 * verification, and an agent can have either without the other.
 */
export const RegistrySource = z
  .object({
    registry_id: z.string().catch(""),
    registry_name: z.string().catch(""),
    verified_at: z.string().nullable().catch(null),
  })
  .loose();
export type RegistrySource = z.infer<typeof RegistrySource>;

export const RegisteredAgent = z
  .object({
    agent_id: z.string(),
    agent_type: z.string().catch("other"),
    trust_status: z.string().catch("unknown"),
    registry_sources: z.array(RegistrySource).catch([]),
    registered_at: z.string().nullable().catch(null),
    last_seen: z.string().nullable().catch(null),
    interaction_count: z.number().catch(0),
    agent_card: z
      .object({ name: z.string().catch(""), url: z.string().catch("") })
      .loose()
      .nullable()
      .catch(null),
  })
  .loose();
export type RegisteredAgent = z.infer<typeof RegisteredAgent>;

export const AgentList = z
  .object({ agents: z.array(RegisteredAgent), total: z.number().catch(0) })
  .loose();
export type AgentList = z.infer<typeof AgentList>;

export const agents = (
  c: Connection,
  query: { agent_type?: string; trust_status?: string } = {},
  signal?: AbortSignal,
): Promise<Result<AgentList>> => get(c, PATHS.agents, { schema: AgentList, query, signal });
