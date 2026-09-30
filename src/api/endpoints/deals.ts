import { z } from "zod";
import { get, request, TIMEOUTS, type Connection } from "../http";
import type { Result } from "../errors";
import type { BulkDealAction, DealTypeCode } from "../vocabulary";
import { Money, MutationAck } from "./shared";

const PATHS = {
  deals: "/api/v1/deals",
  dealsExport: "/api/v1/deals/export",
} as const;

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
    /** Set client-side when the agent has no list route and the export fed it. */
    fromExport: z.boolean().optional(),
  })
  .loose();
export type DealList = z.infer<typeof DealList>;

/**
 * What the list route puts on the wire. Two shapes exist: the original
 * `{deals: [{deal: …}], count, skipped}` envelope list, and the current agent's
 * `{items: […]}` of flat deals whose CPMs are float dollars with the currency
 * beside them, not `Money`. Both are read and normalised to `DealList` so no
 * screen has to know which agent it is talking to.
 */
const DealListWire = z
  .object({
    deals: z.array(DealEnvelope).optional(),
    items: z.array(z.looseObject({ deal_id: z.string() })).optional(),
    count: z.number().optional(),
    skipped: z.array(z.string()).catch([]),
  })
  .loose();

const moneyOf = (v: unknown, currency: unknown) => {
  if (typeof v === "number") {
    return {
      amount_micros: Math.round(v * 1_000_000),
      currency: typeof currency === "string" ? currency : "USD",
    };
  }
  return v ?? null;
};

/** Flat item → the envelope entry, or undefined when it will not parse. */
const fromItem = (item: Record<string, unknown>): DealEnvelope | undefined => {
  const pricing = item.pricing as Record<string, unknown> | null | undefined;
  const flat = pricing
    ? {
        ...pricing,
        base_cpm: moneyOf(pricing.base_cpm, pricing.currency),
        final_cpm: moneyOf(pricing.final_cpm, pricing.currency),
      }
    : pricing;
  const parsed = DealEnvelope.safeParse({ deal: { ...item, pricing: flat } });
  return parsed.success ? parsed.data : undefined;
};

export const deals = async (
  c: Connection,
  query: { status?: string } = {},
  signal?: AbortSignal,
): Promise<Result<DealList>> => {
  const w = await get(c, PATHS.deals, {
    schema: DealListWire,
    query,
    timeoutMs: TIMEOUTS.heavy,
    signal,
  });
  const r: Result<DealList> =
    w.kind !== "ok"
      ? w
      : (() => {
          const skipped = [...w.data.skipped];
          const flat = (w.data.items ?? []).flatMap((i) => {
            const d = fromItem(i);
            if (!d) skipped.push(i.deal_id);
            return d ? [d] : [];
          });
          const rows = [...(w.data.deals ?? []), ...flat];
          return {
            ...w,
            data: { deals: rows, count: w.data.count ?? rows.length, skipped },
          };
        })();
  // Some agent builds have no list route and answer the GET with a 405. The
  // export feed is the only other full read, so fall back to it rather than
  // leave the screen empty — flagged `fromExport` so the screen can say the
  // rows are the feed's, not the list's.
  if (r.kind === "unavailable" && r.status === 405) {
    const e = await dealsExport(c, { format: "generic" }, signal);
    if (e.kind !== "ok") return e.kind === "unavailable" ? r : e;
    const wanted = query.status;
    const parsed = (e.data.deals ?? []).flatMap((d) => {
      const entry = DealExportEntry.safeParse(d);
      return entry.success ? [entry.data] : [];
    });
    const entries = parsed.map((d) => ({
      ...d,
      status: d.status === "confirmed" ? "booked" : d.status,
    }));
    const rows = entries.filter((d) => !wanted || d.status === wanted);
    const micros = (n: number | null) =>
      n === null
        ? null
        : { amount_micros: Math.round(n * 1_000_000), currency: "USD" };
    return {
      kind: "ok",
      fetchedAt: e.fetchedAt,
      data: {
        count: rows.length,
        skipped: [],
        fromExport: true,
        deals: rows.map((d) => ({
          deal: {
            deal_id: d.deal_id,
            deal_type: d.deal_type,
            status: d.status,
            quote_id: null,
            product: d.product,
            pricing: {
              final_cpm: micros(d.final_cpm),
              base_cpm: micros(d.base_cpm),
              pricing_model: "cpm",
            },
            terms: null,
            buyer_tier: d.buyer_tier,
            expires_at: d.expires_at,
            created_at: d.created_at,
          },
        })),
      },
    };
  }
  return r;
};

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

/**
 * WRITES upstream: reading a single deal lazily expires it past `expires_at`
 * as a side effect. The repo avoided wiring this route up until now for
 * exactly that reason. Any screen that calls `dealById` must render
 * `<WritesNotice>` (src/components/WritesNotice.tsx) so an operator watching
 * a deal flip to `expired` mid-browse knows the console caused it.
 *
 * Reuses `DealEnvelope`: the response is `{ deal, audience_plan_snapshot,
 * audience_match_summary }`, and the extra top-level fields fall through
 * `.loose()`. Same shared wire vocabulary as the list, unlike `/export`.
 */
export const dealById = (
  c: Connection,
  dealId: string,
  signal?: AbortSignal,
): Promise<Result<DealEnvelope>> =>
  get(c, `${PATHS.deals}/${encodeURIComponent(dealId)}`, {
    schema: DealEnvelope,
    signal,
  });

/**
 * The raw DSP connector feed described above the `Deal` schema. Its statuses
 * are the internal vocabulary (`confirmed`, not the shared `booked`) and its
 * CPMs are float dollars rather than `Money`, so this cannot reuse `Deal`.
 */
export const DealExportEntry = z
  .object({
    deal_id: z.string(),
    deal_type: z.string().catch("unknown"),
    status: z.string().catch("unknown"),
    product: z
      .object({ product_id: z.string().catch(""), name: z.string().catch("") })
      .loose()
      .nullable()
      .catch(null),
    base_cpm: z.number().nullable().catch(null),
    final_cpm: z.number().nullable().catch(null),
    currency: z.string().catch("USD"),
    buyer_tier: z.string().catch("public"),
    seller_id: z.string().nullable().catch(null),
    created_at: z.string().nullable().catch(null),
    expires_at: z.string().nullable().catch(null),
  })
  .loose();
export type DealExportEntry = z.infer<typeof DealExportEntry>;

export const DealsExport = z
  .object({
    format: z.string().optional(),
    // Entries stay unparsed here. `.catch([])` on the typed array turned any
    // entry that did not match into an empty export, which the lookup then
    // showed as "no deals" — a wrong answer, not a degraded one. Callers that
    // need the typed shape parse per entry and drop the ones that fail.
    deals: z.array(z.unknown()).optional(),
    count: z.number().optional(),
  })
  .loose();
export type DealsExport = z.infer<typeof DealsExport>;

/** Unpaginated — it scans every `deal:*` key, same as the list — hence heavy. */
export const dealsExport = (
  c: Connection,
  query: { format?: string; status?: string } = {},
  signal?: AbortSignal,
): Promise<Result<DealsExport>> =>
  get(c, PATHS.dealsExport, {
    schema: DealsExport,
    query,
    timeoutMs: TIMEOUTS.heavy,
    signal,
  });

export const DealBuyerStatus = z
  .object({
    deal_id: z.string(),
    buyer_url: z.string(),
    buyer_status: z.string().catch("unknown"),
    last_checked: z.string().nullable().catch(null),
    // Set when the agent's own probe of buyer_url failed (e.g. a 404 from the
    // buyer's status endpoint); absent on a clean check.
    error: z.string().nullable().catch(null),
  })
  .loose();
export type DealBuyerStatus = z.infer<typeof DealBuyerStatus>;

export const dealBuyerStatus = (
  c: Connection,
  dealId: string,
  buyerUrl: string,
  signal?: AbortSignal,
): Promise<Result<DealBuyerStatus>> =>
  get(c, `${PATHS.deals}/${encodeURIComponent(dealId)}/buyer-status`, {
    schema: DealBuyerStatus,
    query: { buyer_url: buyerUrl },
    signal,
  });

/**
 * Shape inferred, not observed: this deployment has no SSPs configured
 * (`available_ssps` is always `[]`), so only the 400 `unknown_ssp` error path
 * could be probed live. Narrowed to what the `buyer-status` sibling suggests
 * a per-deal diagnostic route returns; revisit against a real response once
 * an SSP is configured somewhere this can be checked.
 */
export const DealSspTroubleshoot = z
  .object({
    deal_id: z.string(),
    ssp_name: z.string(),
    status: z.string().catch("unknown"),
    checked_at: z.string().nullable().catch(null),
    issues: z.array(z.string()).catch([]),
  })
  .loose();
export type DealSspTroubleshoot = z.infer<typeof DealSspTroubleshoot>;

export const dealSspTroubleshoot = (
  c: Connection,
  dealId: string,
  sspName: string,
  signal?: AbortSignal,
): Promise<Result<DealSspTroubleshoot>> =>
  get(c, `${PATHS.deals}/${encodeURIComponent(dealId)}/ssp-troubleshoot`, {
    schema: DealSspTroubleshoot,
    query: { ssp_name: sspName },
    signal,
  });

export const generateDeal = (
  c: Connection,
  body: { proposal_id: string; dsp_platform?: string },
  signal?: AbortSignal,
): Promise<Result<MutationAck>> =>
  // Legacy OpenDirect path, distinct from POST /api/v1/deals (book from quote).
  request(c, "/deals", { schema: MutationAck, method: "POST", body, signal });

export const bookDeal = (
  c: Connection,
  body: { quote_id: string; idempotency_key: string; notes?: string },
  signal?: AbortSignal,
): Promise<Result<MutationAck>> =>
  request(c, PATHS.deals, {
    schema: MutationAck,
    method: "POST",
    body,
    signal,
  });

export const dealFromTemplate = (
  c: Connection,
  // Short codes only: the service uppercases this and looks it up in a
  // PG/PD/PA map, so a long form like "preferred_deal" is a 400.
  body: { deal_type: DealTypeCode; product_id: string },
  signal?: AbortSignal,
): Promise<Result<MutationAck>> =>
  request(c, `${PATHS.deals}/from-template`, {
    schema: MutationAck,
    method: "POST",
    body,
    signal,
  });

/**
 * The batch answers 200 whatever happened to each operation: an unknown
 * action or a missing deal is a `success: false` entry, not an error status.
 * So the per-operation results are parsed, because a bare acknowledgement
 * would report a batch where nothing landed as accepted.
 */
export const BulkDealResponse = z
  .object({
    total: z.number().catch(0),
    succeeded: z.number().catch(0),
    failed: z.number().catch(0),
    results: z
      .array(
        z
          .object({
            index: z.number().catch(0),
            action: z.string().catch(""),
            success: z.boolean().catch(false),
            deal_id: z.string().nullable().catch(null),
            error: z.string().nullable().catch(null),
          })
          .loose(),
      )
      .catch([]),
  })
  .loose();
export type BulkDealResponse = z.infer<typeof BulkDealResponse>;

export const bulkDealOperations = (
  c: Connection,
  body: {
    operations: readonly {
      action: BulkDealAction;
      deal_id?: string;
      quote_id?: string;
      notes?: string;
    }[];
  },
  signal?: AbortSignal,
): Promise<Result<BulkDealResponse>> =>
  request(c, `${PATHS.deals}/bulk`, {
    schema: BulkDealResponse,
    method: "POST",
    body,
    signal,
  });

export const pushDeal = (
  c: Connection,
  body: { deal_id: string; buyer_urls: string[] },
  signal?: AbortSignal,
): Promise<Result<MutationAck>> =>
  request(c, `${PATHS.deals}/push`, {
    schema: MutationAck,
    method: "POST",
    body,
    signal,
  });

export const distributeDeal = (
  c: Connection,
  body: { deal_id: string; ssp_name?: string },
  signal?: AbortSignal,
): Promise<Result<MutationAck>> =>
  request(c, `${PATHS.deals}/distribute`, {
    schema: MutationAck,
    method: "POST",
    body,
    signal,
  });

export const createCuratedDeal = (
  c: Connection,
  body: { curator_id: string; deal_type?: string },
  signal?: AbortSignal,
): Promise<Result<MutationAck>> =>
  request(c, `${PATHS.deals}/curated`, {
    schema: MutationAck,
    method: "POST",
    body,
    signal,
  });

export const migrateDeal = (
  c: Connection,
  dealId: string,
  // `DealMigrationRequest` requires `old_deal_id` even though the service
  // reads the deal from the path; without it the body is a 422.
  body: { old_deal_id: string; reason?: string },
  signal?: AbortSignal,
): Promise<Result<MutationAck>> =>
  request(c, `${PATHS.deals}/${encodeURIComponent(dealId)}/migrate`, {
    schema: MutationAck,
    method: "POST",
    body,
    signal,
  });

export const deprecateDeal = (
  c: Connection,
  dealId: string,
  body: { reason: string; replacement_deal_id?: string },
  signal?: AbortSignal,
): Promise<Result<MutationAck>> =>
  request(c, `${PATHS.deals}/${encodeURIComponent(dealId)}/deprecate`, {
    schema: MutationAck,
    method: "POST",
    body,
    signal,
  });
