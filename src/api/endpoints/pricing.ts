import { z } from "zod";
import { get, request, TIMEOUTS, type Connection } from "../http";
import type { Result } from "../errors";

const PATHS = {
  rateCard: "/api/v1/rate-card",
  pricing: "/pricing",
} as const;

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
 * A price for a hypothetical line: tier and volume discounts applied to the
 * rate card, for one product, without booking anything.
 *
 * A POST that changes nothing — the input does not fit in a URL — so it is
 * exempt from the write switch by exact path (QUERY_SHAPED_PATHS in
 * src/api/policy.ts, and ADR 12 for what that exemption costs).
 *
 * An unknown product answers 404 `{"detail": "Product not found"}`, which the
 * seam reports as `unavailable / "http"`. That is a typo in the form rather
 * than an outage, and a caller should say so.
 */
export const PricingQuote = z
  .object({
    product_id: z.string(),
    base_price: z.number(),
    final_price: z.number(),
    currency: z.string().catch("USD"),
    tier_discount: z.number().catch(0),
    volume_discount: z.number().catch(0),
    /**
     * The agent's own sentence explaining the number. Rendered verbatim: a
     * price with a discount applied and no reason given is a number an
     * operator cannot defend to a buyer.
     */
    rationale: z.string().catch(""),
  })
  .loose();
export type PricingQuote = z.infer<typeof PricingQuote>;

export const pricingQuote = (
  c: Connection,
  body: {
    product_id: string;
    buyer_tier?: string;
    agency_id?: string;
    advertiser_id?: string;
    volume?: number;
  },
  signal?: AbortSignal,
): Promise<Result<PricingQuote>> =>
  request(c, PATHS.pricing, { schema: PricingQuote, method: "POST", body, signal });

/** Replaces the stored rate card. Not a merge. A failure leaves the previous card. */
export const putRateCard = (
  c: Connection,
  entries: readonly { inventory_type: string; base_cpm: number; currency?: string; notes?: string }[],
  signal?: AbortSignal,
): Promise<Result<RateCard>> =>
  request(c, PATHS.rateCard, { schema: RateCard, method: "PUT", body: entries, signal });
