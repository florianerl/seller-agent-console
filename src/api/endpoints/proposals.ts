import { z } from "zod";
import { get, request, type Connection } from "../http";
import type { Result } from "../errors";
import { eachOrCount, selectable, settable } from "../openproposal/shape";
import { MutationAck } from "./shared";

/**
 * OpenProposal 3.0 (AAMP 3.0), against a contract that does not exist yet.
 *
 * The spec (`3.0-draft-1`) defines an object model and no transport, and the
 * upstream seller agent serves none of these routes. The paths below are the
 * console's proposal to upstream, recorded in ADR 14 and listed as PROVISIONAL
 * in the drift guard — which fails the day the agent's captured surface starts
 * declaring one, so the guess gets checked the moment there is something to
 * check it against.
 *
 * Nothing here is called unless the agent card advertises the protocol (see
 * `src/api/capabilities.ts`). Against a 2.x agent the console sends no request
 * to `/api/v3` at all; that is the backwards-compatibility contract, and a
 * screen test asserts it on the wire.
 *
 * Not to be confused with `negotiation.ts`: the agent's existing `/proposals`
 * routes are the pre-3.0 submit-and-counter flow and stay exactly as they are.
 */

const PATHS = {
  proposals: "/api/v3/proposals",
} as const;

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

    buying_route: text,
    serving_mode: text,
    deal_id_issuance: text,
    external_references: z.array(ExternalReference).catch([]),
    correlation_id: text,
  })
  .loose();
export type LineItem = z.infer<typeof LineItem>;

const lineItems = z.unknown().optional().transform((raw) => eachOrCount(raw, (item) => LineItem.safeParse(item)));

const HistoryEntry = z
  .object({
    version: amount,
    actor: text,
    /** proposed · countered · accepted · declined · withdrawn, rendered as sent. */
    action: text,
    fields_changed: strings,
    at: text,
  })
  .loose();
export type HistoryEntry = z.infer<typeof HistoryEntry>;

/**
 * The Summary Representation (§2.1) — what the list returns. `status` and
 * `type` are not in the spec's summary field list, so they may legitimately
 * be absent here and must read as not reported rather than guessed.
 */
export const ProposalSummary = z
  .object({
    proposal_id: z.string(),
    version: amount,
    seller_name: text,
    type: text,
    status: text,
    description: z.string().catch(""),
    valid_from: text,
    valid_until: text,
    line_items: lineItems,
  })
  .loose();
export type ProposalSummary = z.infer<typeof ProposalSummary>;

/** The Full Representation, catalog references resolved (§2.1). */
export const Proposal = ProposalSummary.extend({
  seller_id: text,
  brief_ref: text,
  /** Shape is WS1's, not this spec's; kept loose and shown as reported. */
  assent: z.looseObject({}).nullable().catch(null),
  negotiation_history: z.array(HistoryEntry).catch([]),
  specifications: z.union([z.string(), z.looseObject({})]).nullable().catch(null),
  best_for: strings,
  not_suitable_for: strings,
  seasonality_notes: text,
}).loose();
export type Proposal = z.infer<typeof Proposal>;

export const ProposalList = z
  .object({
    proposals: z.unknown().optional().transform((raw) => eachOrCount(raw, (item) => ProposalSummary.safeParse(item))),
    total: z.number().catch(0),
  })
  .loose();
export type ProposalList = z.infer<typeof ProposalList>;

export const openProposals = (
  c: Connection,
  query: { status?: string; type?: string; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<Result<ProposalList>> => get(c, PATHS.proposals, { schema: ProposalList, query, signal });

export const openProposalById = (
  c: Connection,
  proposalId: string,
  signal?: AbortSignal,
): Promise<Result<Proposal>> =>
  get(c, `${PATHS.proposals}/${encodeURIComponent(proposalId)}`, { schema: Proposal, signal });

// --- lifecycle writes -------------------------------------------------------
//
// Every write carries an idempotency key and the version the operator was
// looking at. The key makes a retry after a lost response safe (§5.6.1 asks
// the same of commitments); the version turns "someone else moved it while you
// were reading" into a 409 instead of a silent overwrite. Each touches one
// object, so there is no partial failure to leave behind. Each call is spelt
// out rather than routed through a helper: the drift guard reads the path
// argument of every `request(...)` statically, and a variable reads as
// unresolved.

type Guarded = { idempotency_key: string; expected_version: number | null };

/** draft → published. Buyer agents can discover it from this point. */
export const publishProposal = (
  c: Connection,
  proposalId: string,
  body: Guarded,
  signal?: AbortSignal,
): Promise<Result<MutationAck>> =>
  request(c, `${PATHS.proposals}/${encodeURIComponent(proposalId)}/publish`, { schema: MutationAck, method: "POST", body, signal });

/** → withdrawn. Terminal. */
export const withdrawProposal = (
  c: Connection,
  proposalId: string,
  body: Guarded & { reason?: string },
  signal?: AbortSignal,
): Promise<Result<MutationAck>> =>
  request(c, `${PATHS.proposals}/${encodeURIComponent(proposalId)}/withdraw`, { schema: MutationAck, method: "POST", body, signal });

/** requested → held (grant) or held → released (release), §5.6.2. */
export const holdLineItem = (
  c: Connection,
  proposalId: string,
  lineItemId: string,
  body: Guarded & { action: "grant" | "release" },
  signal?: AbortSignal,
): Promise<Result<MutationAck>> =>
  request(
    c,
    `${PATHS.proposals}/${encodeURIComponent(proposalId)}/line-items/${encodeURIComponent(lineItemId)}/hold`,
    { schema: MutationAck, method: "POST", body, signal },
  );

/**
 * The seller's assent on the version under review. Accepting makes that
 * version binding: status becomes `agreed`, holds convert, and the stored
 * record is frozen with every catalog reference resolved (§2.2, §5.6.1).
 */
export const assentProposal = (
  c: Connection,
  proposalId: string,
  body: Guarded & { decision: "accept" | "decline"; reason?: string },
  signal?: AbortSignal,
): Promise<Result<MutationAck>> =>
  request(c, `${PATHS.proposals}/${encodeURIComponent(proposalId)}/assent`, { schema: MutationAck, method: "POST", body, signal });
