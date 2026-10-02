import { z } from "zod";

/**
 * Zod compiles validators with `new Function` when it can, and detects whether
 * it can by calling it inside a try/catch. Under this app's CSP —
 * `script-src 'self'`, no `'unsafe-eval'` — that call is blocked, the catch
 * fires, and Zod silently falls back. Functionally harmless, but it reports a
 * content-security-policy violation to the browser on every single load, which
 * puts a permanent entry in the issues panel and fails the Lighthouse
 * `inspector-issues` budget. Worse, it trains anyone looking at that panel to
 * ignore it.
 *
 * Telling Zod not to try is better than loosening the policy to permit eval.
 * The schemas here are small and parsed a few times a second at most; the
 * interpreted path costs nothing that matters.
 *
 * This module is imported first by the barrel, so the configuration is in place
 * before any schema in any domain module is constructed.
 */
z.config({ jitless: true });

/**
 * Money as the agent reports it. Shared because a deal, a rate card entry and a
 * product all quote the same shape and must not drift apart.
 */
export const Money = z
  .object({ amount_micros: z.number(), currency: z.string().catch("USD") })
  .loose();
export type Money = z.infer<typeof Money>;

/** Empty ack: many mutation routes return an untyped body. */
export const MutationAck = z.looseObject({});
export type MutationAck = z.infer<typeof MutationAck>;

/**
 * Who the deal is for, as the quote, template and booking routes take it. The
 * agent uses it to set the pricing tier (capped server-side by what its
 * registry can verify), so supplying it can change the rate. Only the four
 * fields every one of those routes accepts: the template route's model has no
 * names, and a field one route would drop silently is worse than not offering
 * it.
 */
export type BuyerIdentityInput = {
  seat_id?: string;
  agency_id?: string;
  advertiser_id?: string;
  dsp_platform?: string;
};

/**
 * The full identity the quote and booking routes take (`BuyerIdentity`). The
 * template and migration routes use a narrower model with only the four
 * fields of `BuyerIdentityInput`, so the two stay separate types.
 */
export type BuyerIdentityFull = BuyerIdentityInput & {
  seat_name?: string;
  agency_name?: string;
  agency_holding_company?: string;
  advertiser_name?: string;
  advertiser_industry?: string;
  campaign_id?: string;
  campaign_name?: string;
};

/** `ConsentContext`: privacy signals that ride with a quote or a booking (FD-10). */
export type ConsentContextInput = {
  applicable_regimes?: string[];
  gpp_string?: string;
  gpp_section_ids?: number[];
  tcf_string?: string;
  gdpr_applies?: boolean;
  us_privacy?: string;
  diligence_status?: "unknown" | "pending" | "passed" | "failed";
  verified_at?: string;
};

/** `LinearTVParams`: required when the media type is linear TV, and refused otherwise. */
export type LinearTvInput = {
  target_demo: string;
  grps_requested?: number;
  dayparts?: string[];
  networks?: string[];
  dmas?: string[];
  spot_length?: number;
  target_cpp?: { amount_micros: number; currency: string };
  measurement_currency?: string;
  rotation?: string;
};
