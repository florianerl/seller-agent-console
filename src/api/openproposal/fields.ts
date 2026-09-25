/**
 * What the OpenProposal spec says about each field, as opposed to what the
 * agent sent.
 *
 * Mutability markers are not on the wire: the spec assigns them statically
 * (Appendix A), so a console that shows one is quoting the spec, and has to be
 * able to say which revision. Pinned to the draft below; when the spec is
 * revised this table is regenerated from the new Appendix A, not edited to
 * taste, and the revision string moves with it.
 */
export const SPEC_REVISION = "3.0-draft-1";

export type Marker =
  | "immutable"
  | "seller-set"
  | "selectable"
  | "settable"
  | "supplied"
  | "requestable"
  | "derived"
  | "mixed";

/** Spec §3, in the spec's words, for the chip tooltip. */
export const MARKER_MEANING: Readonly<Record<Marker, string>> = {
  immutable: "Set once at creation. Neither party may change it.",
  "seller-set": "The seller sets it and may revise it while draft or published.",
  selectable: "The buyer chooses from a seller-declared set, without seller assent.",
  settable: "The buyer supplies a value within seller-declared bounds, without seller assent.",
  supplied: "The buyer provides data or an artifact.",
  requestable: "The buyer may ask outside the declared space. Needs explicit seller assent.",
  derived: "Computed from other fields. Neither party sets it.",
  mixed: "Sub-fields carry different markers.",
};

/** Appendix A of `3.0-draft-1`, in document order. */
export const FIELD_MARKERS: Readonly<Record<string, Marker>> = {
  // 4.1 Identity and lifecycle (proposal)
  proposal_id: "immutable",
  version: "derived",
  seller_id: "immutable",
  seller_name: "immutable",
  type: "immutable",
  status: "derived",
  assent: "derived",
  valid_from: "seller-set",
  valid_until: "seller-set",
  brief_ref: "supplied",
  negotiation_history: "derived",
  // 4.2 Agent comprehension
  description: "seller-set",
  specifications: "seller-set",
  best_for: "seller-set",
  not_suitable_for: "seller-set",
  seasonality_notes: "seller-set",
  // 5.1 Identity (line item)
  line_item_id: "immutable",
  channel: "immutable",
  // 5.2 Inventory composition
  properties: "selectable",
  content_detail: "seller-set",
  environments: "selectable",
  // 5.3 Audience reach
  audiences: "selectable",
  addressable_scale: "derived",
  activation_route: "selectable",
  buyer_supplied: "supplied",
  // 5.4 Creative requirements
  formats: "selectable",
  specs: "seller-set",
  third_party_tags: "seller-set",
  creative_delivery: "seller-set",
  assets: "supplied",
  materials_due: "requestable",
  approval: "seller-set",
  production: "selectable",
  // 5.5 Targeting envelope
  geo: "settable",
  device: "settable",
  daypart: "settable",
  frequency_cap: "settable",
  // 5.6 Commercial terms
  pricing: "mixed",
  "pricing.cost_method": "seller-set",
  "pricing.gross_rate": "seller-set",
  "pricing.agreed_rate": "derived",
  "pricing.seller_rate": "seller-set",
  "pricing.price_valid_until": "seller-set",
  "pricing.currency": "seller-set",
  "pricing.floor": "seller-set",
  availability: "derived",
  commitment_bounds: "seller-set",
  commitment: "settable",
  hold_status: "requestable",
  min_spend: "seller-set",
  cancellation_policy: "selectable",
  exclusivity: "selectable",
  creative_policy: "seller-set",
  // 5.7 Guarantees
  committed_metrics: "requestable",
  measurement_source: "selectable",
  shortfall_remedy: "selectable",
  reporting: "selectable",
  // 5.8 Transaction eligibility
  visibility: "seller-set",
  required_credentials: "seller-set",
  eligible_bidders: "seller-set",
  terms_acceptance_required: "seller-set",
  // 5.9 Execution
  buying_route: "seller-set",
  transaction_mechanism: "selectable",
  serving_mode: "seller-set",
  deal_id_issuance: "derived",
  buyer_requirements: "mixed",
  serving_platform: "seller-set",
  // 5.10 External references and settlement
  external_references: "derived",
  correlation_id: "derived",
  billing: "seller-set",
  supported_order_systems: "seller-set",
};

/**
 * Spec §1.1: where a line item lands once it is bought. OpenProposal does not
 * replace these standards, which is why the console's existing Orders and
 * Deals screens remain the execution view.
 */
export const DOWNSTREAM: Readonly<Record<string, string>> = {
  DIRECT_IO: "OpenDirect 2.1 · Order + Line",
  PROGRAMMATIC_GUARANTEED: "OpenDirect 2.1 + Deals API · deal_id",
  PREFERRED_DEAL: "Deals API + OpenRTB 2.6 · Deal",
  PRIVATE_AUCTION: "Deals API + OpenRTB 2.6 · Deal",
  OPEN_AUCTION: "OpenRTB 2.6 · open auction, no deal",
};
