import { z } from "zod";
import { get, TIMEOUTS, type Connection } from "../http";
import type { Result } from "../errors";
import { Money } from "./shared";

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
  get(c, `${PATHS.deals}/${encodeURIComponent(dealId)}`, { schema: DealEnvelope, signal });

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
    format: z.string().catch("generic"),
    deals: z.array(DealExportEntry).catch([]),
    count: z.number().catch(0),
  })
  .loose();
export type DealsExport = z.infer<typeof DealsExport>;

/** Unpaginated — it scans every `deal:*` key, same as the list — hence heavy. */
export const dealsExport = (
  c: Connection,
  query: { format?: string } = {},
  signal?: AbortSignal,
): Promise<Result<DealsExport>> =>
  get(c, PATHS.dealsExport, { schema: DealsExport, query, timeoutMs: TIMEOUTS.heavy, signal });

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
