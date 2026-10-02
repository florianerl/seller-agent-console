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
 * `AudienceRef`, models/audience_ref.py — the buyer's wire shape. The agent
 * validates only two things and answers 400 with `detail.error` for each: a
 * `type` that is not "agentic", and a missing `identifier`. Those two are all
 * the match reads today; the rest of the ref is echoed back in the response
 * unexamined, and so is `package_id`, which the route accepts and ignores.
 * They are sent anyway so a ref built here is the one a buyer would send.
 */
export type ComplianceContext = {
  readonly jurisdiction: string;
  readonly consent_framework: string;
  readonly consent_string_ref?: string;
  readonly attestation?: string;
  readonly embedding_provenance?: string;
};

export type AudienceRef = {
  readonly type: "agentic";
  readonly identifier: string;
  readonly taxonomy?: string;
  readonly version?: string;
  readonly source?: string;
  readonly confidence?: number;
  readonly compliance_context?: ComplianceContext;
};

export const AudienceMatch = z
  .object({
    match_confidence: z.number().catch(0),
    /** STRONG | MODERATE | WEAK | POOR, as the agent words it (deal_service.py). */
    match_quality: z.string().catch("POOR"),
    matched_capabilities: z.array(z.string()).catch([]),
    /**
     * False means the seller does not advertise agentic addressability at all,
     * which is a different answer from "no match": the score is then a
     * statement about the seller's configuration, not about the audience.
     */
    agentic_supported_by_seller: z.boolean().catch(false),
    rationale: z.string().nullable().catch(null),
    /** The ref as the agent received it, echoed back. */
    audience_ref: z.record(z.string(), z.unknown()).nullable().catch(null),
  })
  .loose();
export type AudienceMatch = z.infer<typeof AudienceMatch>;

export const audienceMatch = (
  c: Connection,
  body: { audience_ref: AudienceRef; package_id?: string },
  signal?: AbortSignal,
): Promise<Result<AudienceMatch>> =>
  request(c, PATHS.match, { schema: AudienceMatch, method: "POST", body, signal });
