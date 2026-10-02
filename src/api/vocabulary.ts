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

/** `NegotiationAction`, `POST /api/v1/negotiations/messages`. Priced actions are counter and final_offer. */
export const NEGOTIATION_ACTIONS = spelled(["counter", "accept", "reject", "final_offer"] as const);
export type NegotiationAction = (typeof NEGOTIATION_ACTIONS)[number]["value"];

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

/** `DiligenceStatus` of a request's consent context. */
export const DILIGENCE_STATUSES = spelled(["unknown", "pending", "passed", "failed"] as const);
export type DiligenceStatus = (typeof DILIGENCE_STATUSES)[number]["value"];

/**
 * The export's `status=` filter, in the stored vocabulary — not the wire one
 * the deal list uses (`confirmed` here is `booked` there).
 */
export const DEAL_EXPORT_STATUSES = spelled(["confirmed", "proposed", "cancelled"] as const);

/**
 * `GET /api/v1/deals/export?format=`. The agent documents these five and
 * defaults to `generic`; the others reshape the same deals for one DSP's import.
 */
export const DEAL_EXPORT_FORMATS = spelled(["generic", "ttd", "dv360", "amazon", "xandr"] as const);
export type DealExportFormat = (typeof DEAL_EXPORT_FORMATS)[number]["value"];

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
export type DealTypeCode = "PG" | "PD" | "PA";
export const DEAL_TYPES: readonly Option<DealTypeCode>[] = [
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
 * `MediaType`, iab_agentic_primitives/primitives/pricing.py. `linear_tv` needs
 * a `linear_tv` parameter block, which the deal wizard collects when it is
 * chosen; sent without one it is a 422.
 */
export const QUOTE_MEDIA_TYPES = spelled(["digital", "ctv", "linear_tv"] as const);
export type QuoteMediaType = (typeof QUOTE_MEDIA_TYPES)[number]["value"];

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
export type BulkDealAction = (typeof BULK_DEAL_ACTIONS)[number]["value"];

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
  // Labelled with the raw value: these are dotted identifiers people search
  // logs for, and "timed out" reads worse than the name it stands for.
].map((value) => ({ value, label: value }));

/**
 * AdCOM `DeviceType`, the integers a package stores (models/media_kit.py,
 * `Package.device_types`). The agent does not check them against this list —
 * the field is `list[int]` — so an unlisted value is stored as sent; that is
 * why the form offers only these.
 */
export const DEVICE_TYPES: readonly { readonly value: number; readonly label: string }[] = [
  { value: 1, label: "mobile / tablet" },
  { value: 2, label: "PC" },
  { value: 3, label: "connected TV" },
  { value: 4, label: "phone" },
  { value: 5, label: "tablet" },
  { value: 6, label: "connected device" },
  { value: 7, label: "set-top box" },
];

/** A device type as read: the AdCOM name when it is one, the raw value otherwise. */
export function deviceLabel(value: number | string): string {
  return DEVICE_TYPES.find((d) => d.value === value)?.label ?? String(value);
}

/**
 * OpenRTB imp sub-object names, per the comment on `Package.ad_formats`
 * (models/media_kit.py). The field is a free `list[str]`, so these are
 * suggestions, not a closed set.
 */
export const AD_FORMATS = ["banner", "video", "native", "audio"] as const;

/** `PackageLayer`, models/media_kit.py: how a package came to exist. */
export const PACKAGE_LAYERS = spelled(["synced", "curated", "dynamic"] as const);

/**
 * `_VALID_AUDIENCE_TYPES`, interfaces/api/routers/media_kit.py. Any other
 * value is a 400 on the media-kit list, search and `/packages` filters.
 */
export const AUDIENCE_TYPES = spelled(["standard", "contextual", "agentic"] as const);
export type AudienceType = (typeof AUDIENCE_TYPES)[number]["value"];

/** `AudienceSource`, models/audience_ref.py. */
export const AUDIENCE_SOURCES = spelled(["explicit", "resolved", "inferred"] as const);
