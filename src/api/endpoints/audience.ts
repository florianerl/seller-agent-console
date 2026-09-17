import { z } from "zod";
import { request, type Connection } from "../http";
import type { Result } from "../errors";

/**
 * Scoring an audience brief against what this seller can actually address.
 *
 * A POST that stores nothing: the agent takes a reference it cannot express in
 * a URL and hands back a score. It is exempt from the write switch by exact
 * path — see QUERY_SHAPED_PATHS in src/api/policy.ts, and ADR 12 for why that
 * exemption makes "read-only" a judgement rather than a checkable property.
 */

const PATHS = {
  match: "/agentic-audience/match",
} as const;

/**
 * The agent validates this in three steps and answers 400 with a different
 * `detail.error` for each: a missing ref, a `type` that is not "agentic", a
 * missing `identifier`. All three are the caller's mistake rather than an
 * outage, so a form collecting this should validate before sending.
 */
export type AudienceRef = {
  readonly type: "agentic";
  readonly identifier: string;
  readonly provider?: string;
};

export const AudienceMatch = z
  .object({
    match_confidence: z.number().catch(0),
    /** POOR | FAIR | GOOD | EXCELLENT, as the agent words it. */
    match_quality: z.string().catch("POOR"),
    matched_capabilities: z.array(z.string()).catch([]),
    /**
     * False means the seller does not advertise agentic addressability at all,
     * which is a different answer from "no match": the score is then a
     * statement about the seller's configuration, not about the audience.
     */
    agentic_supported_by_seller: z.boolean().catch(false),
    rationale: z.string().nullable().catch(null),
  })
  .loose();
export type AudienceMatch = z.infer<typeof AudienceMatch>;

export const audienceMatch = (
  c: Connection,
  body: { audience_ref: AudienceRef; package_id?: string },
  signal?: AbortSignal,
): Promise<Result<AudienceMatch>> =>
  request(c, PATHS.match, { schema: AudienceMatch, method: "POST", body, signal });
