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

/**
 * AdCOM 1.0 "List: Category Taxonomies" — what a package's `cattax` numbers.
 * Upstream's own comment on the field (models/media_kit.py, "1=CT1.0,
 * 2=CT2.0, 3=CT3.0") misnumbers it: 3 is the Ad Product Taxonomy and Content
 * Taxonomy 3.0 is 7. The agent does not check the value and defaults it to
 * 2, a deprecated taxonomy; the one it vendors is 3.1, which is 9. Codes of
 * 500 and up are vendor-specific and are kept when read, not offered.
 */
export const CATEGORY_TAXONOMIES: readonly Option[] = [
  { value: "1", label: "1 · Content Category 1.0 (deprecated)" },
  { value: "2", label: "2 · Content Category 2.0 (deprecated)" },
  { value: "3", label: "3 · Ad Product 1.0" },
  { value: "4", label: "4 · Audience 1.1" },
  { value: "5", label: "5 · Content 2.1" },
  { value: "6", label: "6 · Content 2.2" },
  { value: "7", label: "7 · Content 3.0" },
  { value: "8", label: "8 · Ad Product 2.0" },
  { value: "9", label: "9 · Content 3.1" },
];

/** The `cattax` whose ids the console can offer as choices (src/data/taxonomies). */
export const LISTED_CATTAX = "9";

/**
 * ISO 3166-1 alpha-2, the 249 assigned codes. Geo targets also take
 * subdivisions (US-NY, ISO 3166-2) and the agent checks neither, so these
 * are suggestions; the names come from the browser (Intl.DisplayNames).
 */
export const COUNTRY_CODES: readonly string[] = `
  AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS
  BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE
  EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM
  HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC
  LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA
  NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW
  SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO
  TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW
`
  .trim()
  .split(/\s+/);

let regionNames: Intl.DisplayNames | undefined;

/** A country's English name, or undefined when the browser does not know the code. */
export function countryName(code: string): string | undefined {
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
    return regionNames.of(code);
  } catch {
    return undefined;
  }
}
