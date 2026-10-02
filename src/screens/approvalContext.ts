/**
 * What a proposal approval carries beyond its envelope, read defensively.
 *
 * The agent attaches `context` (its evaluation of the proposal and, when it
 * countered, the counter terms) and `flow_state_snapshot` (the products the
 * flow loaded) to the approval. Neither is in the OpenAPI document — the
 * response has no schema — so every read here is a type-checked guess that
 * degrades to "absent" rather than to a wrong number.
 *
 * The proposal as the buyer submitted it (deal type, flight dates, price,
 * volume) is `flow_state_snapshot.proposal_data`.
 */

type Bag = Record<string, unknown>;

const bag = (value: unknown): Bag =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Bag) : {};
const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
const str = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;
const flag = (value: unknown): boolean | undefined => (typeof value === "boolean" ? value : undefined);

export type ProposalContext = {
  recommendation?: string | undefined;
  /** The agent's own explanation of a counter. */
  reason?: string | undefined;
  productName?: string | undefined;
  productId?: string | undefined;
  currency?: string | undefined;
  basePrice?: number | undefined;
  floorPrice?: number | undefined;
  requestedPrice?: number | undefined;
  requestedImpressions?: number | undefined;
  /** The proposal as submitted: `flow_state_snapshot.proposal_data`. */
  dealType?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  /** What the agent proposes back, when it countered. */
  counterPrice?: number | undefined;
  counterImpressions?: number | undefined;
  recommendedPrice?: number | undefined;
  availableImpressions?: number | undefined;
  priceAcceptable?: boolean | undefined;
  pricingVerified?: boolean | undefined;
  pricingVerificationReason?: string | undefined;
  audienceValidated?: boolean | undefined;
  problems: string[];
  /** The flow's own cautions, e.g. a requested deal type the product does not support. */
  warnings: string[];
};

export function proposalContext(request: Record<string, unknown>): ProposalContext | undefined {
  const context = bag(request.context);
  const evaluation = bag(context.evaluation);
  const counter = bag(context.counter_terms);
  const snapshot = bag(request.flow_state_snapshot);
  const submitted = bag(snapshot.proposal_data);
  if (Object.keys(evaluation).length === 0 && Object.keys(counter).length === 0) return undefined;

  const productId = str(evaluation.product_id);
  const product = productId ? bag(bag(snapshot.products)[productId]) : {};
  const problems = [evaluation.validation_errors, evaluation.targeting_notes, evaluation.audience_gaps]
    .flatMap((list): unknown[] => (Array.isArray(list) ? (list as unknown[]) : []))
    .map((item) => (typeof item === "string" ? item : JSON.stringify(item)));

  return {
    recommendation: str(evaluation.recommendation) ?? str(context.recommendation),
    reason: str(counter.reason),
    productName: str(product.name),
    productId,
    currency: str(product.currency),
    basePrice: num(product.base_cpm),
    floorPrice: num(product.floor_cpm) ?? num(evaluation.minimum_acceptable_price),
    requestedPrice: num(evaluation.requested_price) ?? num(submitted.price),
    requestedImpressions: num(evaluation.requested_impressions) ?? num(submitted.impressions),
    dealType: str(submitted.deal_type),
    startDate: str(submitted.start_date),
    endDate: str(submitted.end_date),
    counterPrice: num(counter.proposed_price),
    counterImpressions: num(counter.max_impressions),
    recommendedPrice: num(evaluation.recommended_price),
    availableImpressions: num(evaluation.available_impressions),
    priceAcceptable: flag(evaluation.price_acceptable),
    pricingVerified: flag(context.pricing_verified) ?? flag(evaluation.pricing_verified),
    pricingVerificationReason: str(context.pricing_verification_reason),
    audienceValidated: flag(evaluation.audience_validated),
    problems,
    warnings: (Array.isArray(snapshot.warnings) ? (snapshot.warnings as unknown[]) : []).filter(
      (w): w is string => typeof w === "string" && w !== "",
    ),
  };
}

export type NegotiationTurn = {
  round: number;
  action?: string | undefined;
  buyerPrice?: number | undefined;
  sellerPrice?: number | undefined;
  /** What the agent told the buyer. */
  messageToBuyer?: string | undefined;
  /** The agent's own reason for its move, as recorded on the round. */
  reasoning?: string | undefined;
  timestamp?: string | undefined;
};

export type NegotiationLog = {
  turns: NegotiationTurn[];
  status?: string | undefined;
  maxRounds?: number | undefined;
};

/**
 * The back and forth so far, from `flow_state_snapshot.negotiation_history`.
 * Undefined when no round has been played, so a first-time proposal shows
 * no empty conversation.
 */
export function negotiationLog(request: Record<string, unknown>): NegotiationLog | undefined {
  const history = bag(bag(request.flow_state_snapshot).negotiation_history);
  const rounds = Array.isArray(history.rounds) ? (history.rounds as unknown[]) : [];
  const turns = rounds
    .map((raw): NegotiationTurn | undefined => {
      const r = bag(raw);
      const round = num(r.round_number);
      if (round === undefined) return undefined;
      return {
        round,
        action: str(r.action),
        buyerPrice: num(r.buyer_price),
        sellerPrice: num(r.seller_price),
        messageToBuyer: str(r.buyer_rationale),
        reasoning: str(r.rationale),
        timestamp: str(r.timestamp),
      };
    })
    .filter((t): t is NegotiationTurn => t !== undefined)
    .sort((a, b) => a.round - b.round);
  if (turns.length === 0) return undefined;
  return {
    turns,
    status: str(history.status),
    maxRounds: num(bag(history.limits).max_rounds),
  };
}
