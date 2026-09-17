import { z } from "zod";
import { get, type Connection } from "../http";
import type { Result } from "../errors";
import { Money } from "./shared";

const PATHS = {
  quotes: "/api/v1/quotes",
} as const;

// --- quotes --------------------------------------------------------------

/**
 * `GET /api/v1/quotes/{quote_id}` WRITES upstream: the seller enforces a TTL
 * on quotes and this read is where that TTL is checked, so fetching an expired
 * quote flips its stored `status` to `expired` and persists that. The repo
 * deliberately avoided this route until now for exactly that reason — any
 * screen calling `quoteById` must render `WritesNotice` so the operator knows
 * a "read" changed something.
 *
 * Shape is taken from openapi.json's `QuoteResponse`/`Quote` schemas (this is
 * one of the few GETs where the schema isn't empty), narrowed to what a quote
 * card would show. Not probed against a live instance: calling it live would
 * have been the same mutation described above.
 */
export const QuotePricing = z
  .object({
    pricing_type: z.string().catch("fixed"),
    base_cpm: Money.nullable().catch(null),
    final_cpm: Money.nullable().catch(null),
    base_cpp: Money.nullable().catch(null),
    final_cpp: Money.nullable().catch(null),
    tier_discount_pct: z.number().catch(0),
    volume_discount_pct: z.number().catch(0),
    pricing_model: z.string().catch("cpm"),
  })
  .loose();
export type QuotePricing = z.infer<typeof QuotePricing>;

export const QuoteTerms = z
  .object({
    impressions: z.number().nullable().catch(null),
    flight_start: z.string().nullable().catch(null),
    flight_end: z.string().nullable().catch(null),
    guaranteed: z.boolean().catch(false),
    grps: z.number().nullable().catch(null),
    guaranteed_grps: z.number().nullable().catch(null),
    target_demo: z.string().nullable().catch(null),
  })
  .loose();
export type QuoteTerms = z.infer<typeof QuoteTerms>;

export const QuoteAvailability = z
  .object({
    inventory_available: z.boolean().catch(true),
    estimated_fill_rate: z.number().nullable().catch(null),
    competing_demand: z.string().nullable().catch(null),
  })
  .loose();
export type QuoteAvailability = z.infer<typeof QuoteAvailability>;

export const Quote = z
  .object({
    quote_id: z.string(),
    status: z.string().catch("available"),
    deal_type: z.string().catch("PG"),
    product: z
      .object({ product_id: z.string().catch(""), name: z.string().catch("") })
      .loose()
      .nullable()
      .catch(null),
    pricing: QuotePricing.nullable().catch(null),
    terms: QuoteTerms.nullable().catch(null),
    availability: QuoteAvailability.nullable().catch(null),
    buyer_tier: z.string().catch("public"),
    rate_card_id: z.string().nullable().catch(null),
    expires_at: z.string().nullable().catch(null),
    seller_id: z.string().nullable().catch(null),
    created_at: z.string().nullable().catch(null),
    deal_id: z.string().nullable().catch(null),
  })
  .loose();
export type Quote = z.infer<typeof Quote>;

export const QuoteResponse = z.object({ quote: Quote }).loose();
export type QuoteResponse = z.infer<typeof QuoteResponse>;

export const quoteById = (
  c: Connection,
  quoteId: string,
  signal?: AbortSignal,
): Promise<Result<QuoteResponse>> =>
  get(c, `${PATHS.quotes}/${encodeURIComponent(quoteId)}`, { schema: QuoteResponse, signal });
