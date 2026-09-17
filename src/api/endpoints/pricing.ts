import { z } from "zod";
import { get, TIMEOUTS, type Connection } from "../http";
import type { Result } from "../errors";

const PATHS = {
  rateCard: "/api/v1/rate-card",
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
