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
