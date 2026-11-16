import { z } from "zod";
import { get, request, TIMEOUTS, type Connection } from "../http";
import type { Result } from "../errors";
import { eachOrCount, selectable, settable } from "../openproposal/shape";

/**
 * OpenProposal 3.0 (AAMP 3.0), as the upstream seller agent's
 * `feat/openproposal-mapping` branch serves it (e77022e, unmerged). ADR 15.
 *
 * Three groups, each answering a different question:
 *
 * - **GAM mapping** — four POSTs that turn ad-server payloads into OpenProposal
 *   line items and say what did not map. Pure transforms: nothing is stored,
 *   no key is needed, so they are query-shaped and run with writes off
 *   (`QUERY_SHAPED_PATHS`). Plus the static field map, which doubles as the
 *   support probe.
 * - **Many-to-one** — one proposal from objects in several ad servers. Also a
 *   pure transform.
 * - **Negotiation threads** — a buyer asking for a price on one line item,
 *   countering, then committing, which books a real deal. Every thread belongs
 *   to the key that opened it: there is no list, and another key's thread is a
 *   404. An operator console therefore drives its own threads; it cannot watch
 *   a buyer's.
 *
 * None of these are in the captured agent surface yet, so they sit in the
 * drift guard's PROVISIONAL map until the branch merges. Not to be confused
 * with `negotiation.ts`: the agent's `/proposals` routes are the pre-3.0
 * submit-and-counter flow and stay as they are.
 */

const PATHS = {
  fieldMap: "/api/v1/op-gam/line-item/field-map",
  mapLineItem: "/api/v1/op-gam/line-item",
  mapLineItems: "/api/v1/op-gam/line-items",
  mapAdUnit: "/api/v1/op-gam/ad-unit",
  manyToOne: "/api/v1/op-many-to-one/proposal",
  negotiations: "/api/v1/op-negotiations",
} as const;

/** Always ask for the analysis: the console's whole reason to call these is what did not map. */
const EXPLAIN = { explain: true } as const;

const text = z.string().nullable().catch(null);
const amount = z.number().nullable().catch(null);
const strings = z.array(z.string()).catch([]);

const Pricing = z
  .object({
    cost_method: text,
    gross_rate: amount,
    agreed_rate: amount,
    seller_rate: amount,
    floor: amount,
    price_valid_until: text,
    currency: text,
  })
  .loose();
export type LineItemPricing = z.infer<typeof Pricing>;

const Commitment = z
  .object({
    basis: text,
    amount,
    currency: text,
    flight_start: text,
    flight_end: text,
    derived_units: amount,
    idempotency_key: text,
  })
  .loose();

const HoldStatus = z
  .object({
    hold_available: z.boolean().nullable().catch(null),
    hold_duration: text,
    hold_scope: text,
    /** none → requested → held → expired | released | converted (§5.6.2). */
    state: text,
    hold_expires_at: text,
  })
  .loose();
export type HoldStatus = z.infer<typeof HoldStatus>;

const Availability = z
  .object({
    unit: text,
    basis: text,
    /** The agent's own as-of, distinct from when this console fetched it. */
    as_of: text,
    granularity: text,
    type: text,
    quantity: amount,
  })
  .loose();

const CommitmentBounds = z
  .object({ min_impressions: amount, max_impressions: amount, min_budget: amount, max_budget: amount })
  .loose();

const CommittedMetric = z
  .object({ metric: z.string().catch("unknown"), value: amount, basis: text })
  .loose();

const ExternalReference = z
  .object({ system: text, namespace: text, id: text, role: text })
  .loose();

const FrequencyCap = z
  .object({
    max: z.object({ min: amount, max: amount }).loose().nullable().catch(null),
    period: text,
    basis: text,
  })
  .loose();

const optionSpace = z.unknown().optional().transform(selectable);
const envelope = z.unknown().optional().transform(settable);
const optional = <T extends z.ZodType>(schema: T) => schema.nullable().optional().catch(null);

/**
 * One buyable unit, in exactly one channel. Only `line_item_id` is required:
 * the spec is a draft, and a field it renames next revision should read as
 * "not reported" on one card, not blank the proposal.
 */
export const LineItem = z
  .object({
    line_item_id: z.string(),
    /** Independent of the proposal's status: one line item can sell out alone. */
    status: z.string().catch("unknown"),
    channel: z.string().catch("unknown"),

    properties: optionSpace,
    environments: optionSpace,
    audiences: optionSpace,
    formats: optionSpace,
    transaction_mechanism: optionSpace,
    addressable_scale: amount,

    geo: envelope,
    device: envelope,
    daypart: envelope,
    frequency_cap: optional(FrequencyCap),

    pricing: z.array(Pricing).catch([]),
    availability: optional(Availability),
    commitment_bounds: optional(CommitmentBounds),
    commitment: optional(Commitment),
    hold_status: optional(HoldStatus),
    min_spend: amount,

    committed_metrics: z.array(CommittedMetric).catch([]),
    materials_due: text,
    /** A string from the GAM mapping (the line item's name), an object in the spec. */
    content_detail: z.union([z.string(), z.looseObject({})]).nullable().optional().catch(null),

    buying_route: text,
    serving_mode: text,
    deal_id_issuance: text,
    external_references: z.array(ExternalReference).catch([]),
    correlation_id: text,
  })
  .loose();
export type LineItem = z.infer<typeof LineItem>;

const lineItems = z.unknown().optional().transform((raw) => eachOrCount(raw, (item) => LineItem.safeParse(item)));

/**
 * What the mapping analysis says about each OpenProposal field. Kept as plain
 * strings: the vocabularies (`ad_server`, `lossy`, `choice_space_lost`…) are
 * upstream's and still moving, and an unknown word is shown as sent.
 */
const FieldRule = z
  .object({
    gam_field: z.string(),
    op_field: text.optional().catch(null),
    status: z.string().catch("unknown"),
    problem: text.optional().catch(null),
    note: z.string().catch(""),
  })
  .loose();
export type FieldRule = z.infer<typeof FieldRule>;

export const FieldMap = z.array(FieldRule);
export type FieldMap = z.infer<typeof FieldMap>;

const FieldReportEntry = FieldRule.extend({ value: z.unknown() }).loose();
export type FieldReportEntry = z.infer<typeof FieldReportEntry>;

export const MappedLineItem = z
  .object({
    line_item: LineItem,
    provenance: z.record(z.string(), z.string()).catch({}),
    gaps: strings,
    unmapped_source_fields: strings,
    field_report: z.array(FieldReportEntry).catch([]),
    problems: strings,
  })
  .loose();
export type MappedLineItem = z.infer<typeof MappedLineItem>;

const BatchResult = z
  .object({
    gam_line_item_id: z.string(),
    mapped: MappedLineItem.nullable().optional().catch(null),
    error: text.optional().catch(null),
  })
  .loose();
export type BatchResult = z.infer<typeof BatchResult>;

const counts = z.record(z.string(), z.number()).catch({});

export const MappedBatch = z
  .object({
    summary: z
      .object({
        total: z.number().catch(0),
        mapped: z.number().catch(0),
        unmappable_by_type: counts,
        problems: counts,
        field_status_counts: counts,
        gap_counts: counts,
      })
      .loose(),
    results: z.array(BatchResult).catch([]),
  })
  .loose();
export type MappedBatch = z.infer<typeof MappedBatch>;

/** Upstream's `Proposal`: identity, lifecycle and line items, nothing negotiated yet. */
export const BuiltProposal = z
  .object({
    proposal_id: z.string(),
    version: amount,
    seller_id: text,
    seller_name: text,
    type: text,
    status: text,
    description: z.string().catch(""),
    valid_from: text,
    valid_until: text,
    line_items: lineItems,
  })
  .loose();
export type BuiltProposal = z.infer<typeof BuiltProposal>;

export const ManyToOneResult = z
  .object({
    proposal: BuiltProposal,
    report: z
      .array(
        z
          .object({
            line_item_id: z.string(),
            serving_platform: z.string().catch(""),
            source_objects: z.number().catch(0),
            provenance: z.record(z.string(), z.string()).catch({}),
            gaps: strings,
          })
          .loose(),
      )
      .nullable()
      .optional()
      .catch(null),
  })
  .loose();
export type ManyToOneResult = z.infer<typeof ManyToOneResult>;

const HistoryEntry = z
  .object({
    version: amount,
    /** buyer · seller */
    actor: text,
    /** proposed · countered · accepted · declined · withdrawn, rendered as sent. */
    action: text,
    fields_changed: strings,
    at: text,
    /**
     * The spec's entry carries no values, so the rate, the final-offer flag and
     * the engine's rationale ride in `ext` — a proposed extension, not 3.0.
     */
    ext: z
      .object({ rate: amount, final_offer: z.boolean().nullable().catch(null), rationale: text })
      .loose()
      .nullable()
      .optional()
      .catch(null),
  })
  .loose();
export type HistoryEntry = z.infer<typeof HistoryEntry>;

export const NegotiationThread = z
  .object({
    negotiation_id: z.string(),
    proposal_id: z.string().catch(""),
    /** Bumped by every seller counter; a move must name the current one or it is a 409. */
    version: z.number(),
    /** open · accepted · declined · withdrawn · committed */
    state: z.string().catch("unknown"),
    line_item: LineItem,
    negotiation_history: z.array(HistoryEntry).catch([]),
    assent: z
      .object({ buyer_at: text, seller_at: text, version: amount })
      .loose()
      .nullable()
      .optional()
      .catch(null),
  })
  .loose();
export type NegotiationThread = z.infer<typeof NegotiationThread>;

// --- mapping (query-shaped: nothing is stored) -------------------------------

export const opFieldMap = (c: Connection, signal?: AbortSignal): Promise<Result<FieldMap>> =>
  get(c, PATHS.fieldMap, { schema: FieldMap, signal });

export type GamLineItemInput = {
  line_item: Record<string, unknown>;
  order?: Record<string, unknown>;
  network_code?: string;
};

export const mapGamLineItem = (
  c: Connection,
  body: GamLineItemInput,
  signal?: AbortSignal,
): Promise<Result<MappedLineItem>> =>
  request(c, PATHS.mapLineItem, { schema: MappedLineItem, method: "POST", body, query: EXPLAIN, signal });

export const mapGamLineItems = (
  c: Connection,
  body: { line_items: Record<string, unknown>[]; orders?: Record<string, unknown>[]; network_code?: string },
  signal?: AbortSignal,
): Promise<Result<MappedBatch>> =>
  request(c, PATHS.mapLineItems, {
    schema: MappedBatch,
    method: "POST",
    body,
    query: EXPLAIN,
    // A pasted LineItemService export can be hundreds of line items.
    timeoutMs: TIMEOUTS.heavy,
    signal,
  });

export const mapGamAdUnit = (
  c: Connection,
  body: { ad_unit: Record<string, unknown>; network_code?: string },
  signal?: AbortSignal,
): Promise<Result<MappedLineItem>> =>
  request(c, PATHS.mapAdUnit, { schema: MappedLineItem, method: "POST", body, query: EXPLAIN, signal });

export const buildManyToOneProposal = (
  c: Connection,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Result<ManyToOneResult>> =>
  request(c, PATHS.manyToOne, { schema: ManyToOneResult, method: "POST", body, query: EXPLAIN, signal });

// --- negotiation threads (writes, except the read) ---------------------------
//
// Opening a thread quotes the line item and runs the seller's engine; commit
// books a deal. Both get the heavy timeout. Every write carries an idempotency
// key — the agent replays an identical body and 409s a different one — and the
// moves after opening carry the thread version, so a move made against a
// counter the operator has not seen is refused rather than applied.

export type OpenNegotiationBody = {
  idempotency_key: string;
  proposal_id: string;
  version: number;
  /** A seller-agent product id. */
  line_item_id: string;
  transaction_mechanism: string;
  commitment: { basis: "units"; amount: number; flight_start?: string; flight_end?: string };
  /** CPM asked for. A proposed extension; the spec has no field for it. */
  requested_rate: number;
  buyer_identity?: Record<string, string>;
};

export const openOpNegotiation = (
  c: Connection,
  body: OpenNegotiationBody,
  signal?: AbortSignal,
): Promise<Result<NegotiationThread>> =>
  request(c, PATHS.negotiations, {
    schema: NegotiationThread,
    method: "POST",
    body,
    timeoutMs: TIMEOUTS.heavy,
    signal,
  });

export const opNegotiationById = (
  c: Connection,
  negotiationId: string,
  signal?: AbortSignal,
): Promise<Result<NegotiationThread>> =>
  get(c, `${PATHS.negotiations}/${encodeURIComponent(negotiationId)}`, { schema: NegotiationThread, signal });

export type NegotiationMove = {
  idempotency_key: string;
  version: number;
  action: "counter" | "accept" | "decline" | "withdraw";
  requested_rate?: number;
};

export const postOpNegotiationMessage = (
  c: Connection,
  negotiationId: string,
  body: NegotiationMove,
  signal?: AbortSignal,
): Promise<Result<NegotiationThread>> =>
  request(c, `${PATHS.negotiations}/${encodeURIComponent(negotiationId)}/messages`, {
    schema: NegotiationThread,
    method: "POST",
    body,
    timeoutMs: TIMEOUTS.heavy,
    signal,
  });

/** Books first, then agrees: a failed booking leaves nothing agreed. */
export const commitOpNegotiation = (
  c: Connection,
  negotiationId: string,
  body: { idempotency_key: string; version: number },
  signal?: AbortSignal,
): Promise<Result<NegotiationThread>> =>
  request(c, `${PATHS.negotiations}/${encodeURIComponent(negotiationId)}/commit`, {
    schema: NegotiationThread,
    method: "POST",
    body,
    timeoutMs: TIMEOUTS.heavy,
    signal,
  });
