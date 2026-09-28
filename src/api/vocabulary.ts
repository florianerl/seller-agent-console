/**
 * Closed value sets the agent validates, copied so a form can offer them as a
 * choice instead of a text box.
 *
 * Every list here is a copy of an upstream enum, not something the agent
 * publishes: openapi.json types these fields as bare strings, so there is
 * nothing to fetch. Each list names the file it came from, read at seller
 * agent commit 938f7ea. When upstream adds a value, the agent keeps accepting
 * it and this console just does not offer it — a 400 names the valid set, so
 * the drift shows up as a refusal rather than as a silent miswrite.
 *
 * Lives outside `src/api/endpoints/` for the same reason `openproposal/` does:
 * every export of that barrel is swept as an endpoint.
 */

export type Option<V extends string = string> = { readonly value: V; readonly label: string };

/** Snake-case to words, the way every status chip in the console reads. */
export function words(value: string): string {
  return value.replace(/_/g, " ");
}

function spelled<const V extends string>(values: readonly V[]): readonly Option<V>[] {
  return values.map((value) => ({ value, label: words(value) }));
}

/**
 * `OrderStatus`, models/order_state_machine.py. Listed in lifecycle order, not
 * declaration order, so a filter reads top to bottom the way an order moves.
 */
export const ORDER_STATUSES = spelled([
  "draft",
  "submitted",
  "pending_approval",
  "approved",
  "in_progress",
  "syncing",
  "booked",
  "completed",
  "rejected",
  "failed",
  "cancelled",
  "unbooked",
] as const);
export type OrderStatus = (typeof ORDER_STATUSES)[number]["value"];

/**
 * The actor on a transition is a claim, not an identity: the agent stores
 * whatever it is sent. The prefix convention (`system`, `human:<id>`,
 * `agent:<id>`, models/order_state_machine.py) is what the orders report
 * groups on, so a free-text actor quietly lands in no group.
 */
export const ACTOR_KINDS = spelled(["human", "agent", "system"] as const);
export type ActorKind = (typeof ACTOR_KINDS)[number]["value"];

/** `ChangeType`, models/change_request.py. Anything else is a 400. */
export const CHANGE_TYPES = spelled([
  "flight_dates",
  "impressions",
  "pricing",
  "creative",
  "targeting",
  "cancellation",
  "other",
] as const);

/**
 * `ChangeRequestStatus`, models/change_request.py. The service never persists
 * `pending` or `validating` today, but the filter is an exact match on the
 * stored value, so offering them costs nothing and stays right if it starts.
 */
export const CHANGE_REQUEST_STATUSES = spelled([
  "pending",
  "validating",
  "pending_approval",
  "approved",
  "rejected",
  "applied",
  "failed",
] as const);

/**
 * `DealType`, iab_agentic_primitives/primitives/pricing.py — the short wire
 * encoding. Its docstring is explicit that the retired long forms
 * (`preferreddeal`, `preferred_deal`) are not valid wire values.
 */
export const DEAL_TYPES: readonly Option<"PG" | "PD" | "PA">[] = [
  { value: "PG", label: "PG — programmatic guaranteed" },
  { value: "PD", label: "PD — preferred deal" },
  { value: "PA", label: "PA — private auction" },
];

/**
 * `DealType`, models/core.py — the long form the legacy proposal flow still
 * compares against (flows/proposal_handling_flow.py). A mismatch there only
 * adds a warning, but it is a warning about a value this console chose.
 */
export const LEGACY_DEAL_TYPES: readonly Option[] = [
  { value: "programmaticguaranteed", label: "programmatic guaranteed" },
  { value: "preferreddeal", label: "preferred deal" },
  { value: "privateauction", label: "private auction" },
];

/**
 * `MediaType`, iab_agentic_primitives/primitives/pricing.py. `linear_tv` is
 * left out on purpose: it requires a `linear_tv` parameter block the quote
 * form does not collect, so offering it would only ever produce a 422.
 */
export const QUOTE_MEDIA_TYPES = spelled(["digital", "ctv"] as const);

/**
 * The set named in the comments on `InventoryTypeOverride` and
 * `RateCardEntry` (interfaces/api/schemas.py), and exactly the six entries of
 * the default rate card. The field is an unvalidated string upstream, so a
 * typo is stored without complaint and then matches no product — which is
 * the reason to offer a choice here rather than a reason not to.
 */
export const INVENTORY_TYPES = spelled([
  "display",
  "video",
  "ctv",
  "mobile_app",
  "native",
  "audio",
] as const);

/** The actions `bulk_deal_operations` understands (services/deal_service.py). */
export const BULK_DEAL_ACTIONS = spelled(["create", "update", "cancel"] as const);

/**
 * Connector names the SSP factories can build (clients/ssp_factory.py,
 * clients/deal_sync_factory.py). Which of them a deployment has configured is
 * settings, not code, so these are suggestions; a name it lacks is a 400 that
 * lists the ones it has.
 */
export const SSP_NAMES = ["pubmatic", "magnite", "index_exchange", "deals_api_mcp"] as const;

/** `EventType`, events/models.py. The filter is an exact match. */
export const EVENT_TYPES: readonly Option[] = [
  "proposal.received",
  "proposal.evaluated",
  "proposal.accepted",
  "proposal.rejected",
  "proposal.countered",
  "deal.created",
  "deal.registered",
  "deal.synced",
  "execution.completed",
  "approval.requested",
  "approval.granted",
  "approval.denied",
  "approval.timed_out",
  "session.created",
  "session.resumed",
  "session.closed",
  "package.created",
  "package.updated",
  "package.synced",
  "negotiation.started",
  "negotiation.round",
  "negotiation.concluded",
].map((value) => ({ value, label: words(value) }));
